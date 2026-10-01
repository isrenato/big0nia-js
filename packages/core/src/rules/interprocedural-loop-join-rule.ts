// packages/core/src/rules/interprocedural-loop-join-rule.ts
import * as ts from 'typescript';
import type { LoopLike } from '../ast/loop-like.js';
import { findLoopInStatements } from '../ast/nested-loop-finder.js';
import {
  findJoinSignature,
  findVariableAgainstIndexedJoinSignature,
  isRootedIn,
  isRootedInIndexedAccess,
  type JoinSignature,
} from '../ast/join-signature-matcher.js';
import { findAllCallSites } from '../ast/call-site-finder.js';
import { resolveCallTarget, resolveCallableReference, type CallTarget } from '../project/call-target-resolver.js';
import { classifyCollectionSize, type CollectionSize } from '../ast/collection-size-classifier.js';
import { boundsToOnePass } from '../ast/loop-early-exit-analyzer.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import { complexityForJoin, complexityIndexedForm } from '../complexity/complexity-label.js';
import { exprLabel } from '../ast/expr-label.js';
import { type LoopRule, type Finding, type AnalysisContext, lineOf } from './loop-rule.js';

const MAX_HOPS = 20;
const FORWARDING_METHODS = new Set(['forEach', 'map']);

interface IndexedOrigin {
  collectionExpr: ts.Expression;
  indexName: string;
}

interface JoinResult {
  signature: JoinSignature;
  innerCollectionName: string;
  innerCollectionSize: CollectionSize;
  innerFilePath: string;
  innerLine: number;
  chainLabels: string[];
  innerBoundsToOnePass: boolean;
}

export const interproceduralLoopJoinRule: LoopRule = {
  id: 'interprocedural-loop-join',

  check(loop: LoopLike, precedingStmts: ts.Statement[], ctx: AnalysisContext): Finding | null {
    let trackedVar: string | null = null;
    let indexedOrigin: IndexedOrigin | null = null;
    let outerCollectionName: string;

    if (loop.kind === 'for') {
      if (!loop.collectionExpr || !loop.indexName) return null;
      indexedOrigin = { collectionExpr: loop.collectionExpr, indexName: loop.indexName };
      outerCollectionName = exprLabel(loop.collectionExpr) ?? loop.indexName;
    } else {
      if (!loop.itemName) return null;
      trackedVar = loop.itemName;
      outerCollectionName = (loop.collectionExpr && exprLabel(loop.collectionExpr)) ?? loop.itemName;
    }

    const outerClass = loop.collectionExpr ? classifyCollectionSize(loop.collectionExpr, precedingStmts) : 'unknown';

    const result = followChain(loop.bodyStatements, trackedVar, indexedOrigin, ctx.projectIndex, precedingStmts, [], []);
    if (!result) return null;

    if (outerClass === 'fixedSmall' || result.innerCollectionSize === 'fixedSmall') return null;
    if (boundsToOnePass(loop.bodyStatements, loop.kind) || result.innerBoundsToOnePass) return null;

    const sameCollection = outerCollectionName === result.innerCollectionName;
    const before = complexityForJoin(outerCollectionName, result.innerCollectionName, sameCollection);
    const after = complexityIndexedForm(outerCollectionName, result.innerCollectionName, sameCollection);
    const chain = result.chainLabels.join(' → ');

    const message =
      `Potential ${sameCollection ? 'O(n²)' : 'O(n × m)'} algorithm: every item is compared against every ` +
      `${result.innerCollectionName} using ${result.signature.outerDisplay} vs ${result.signature.innerDisplay}, via ` +
      `${chain}. Estimated complexity: ${before}.`;

    const tip =
      `Index ${result.innerCollectionName} by ${result.signature.innerKey} before the loop, then look up matches ` +
      `instead of scanning (inner loop at ${result.innerFilePath}:${result.innerLine}). Possible complexity after ` +
      `optimization: ${after}.`;

    return { ruleId: 'interprocedural-loop-join', line: lineOf(ctx.sourceFile, loop.node), message, tip };
  },
};

function followChain(
  stmts: ts.Statement[],
  trackedVar: string | null,
  indexedOrigin: IndexedOrigin | null,
  projectIndex: AnalysisContext['projectIndex'],
  outerPrecedingStmts: ts.Statement[],
  visited: string[],
  chainLabels: string[]
): JoinResult | null {
  if (chainLabels.length > 0 && trackedVar) {
    const found = findJoinedLoopInBody(stmts, trackedVar, chainLabels);
    if (found) return found;
  }

  if (chainLabels.length >= MAX_HOPS) return null;

  for (const site of findAllCallSites(stmts)) {
    const forwarded = resolveForwardedCallback(site.call, trackedVar, indexedOrigin, projectIndex);
    if (forwarded) {
      const result = continueChain(forwarded, projectIndex, visited, chainLabels);
      if (result) return result;
      continue;
    }

    const argPosition = indexedOrigin
      ? findIndexedArgPosition(site.call, indexedOrigin)
      : trackedVar
        ? findRootedArgPosition(site.call, trackedVar)
        : null;
    if (argPosition === null) continue;

    const target = resolveCallTarget(site.call, [...outerPrecedingStmts, ...site.precedingStmts], projectIndex);
    if (!target) continue;

    const result = continueChain(target, projectIndex, visited, chainLabels, argPosition);
    if (result) return result;
  }

  return null;
}

function continueChain(
  target: CallTarget,
  projectIndex: AnalysisContext['projectIndex'],
  visited: string[],
  chainLabels: string[],
  argPosition = 0
): JoinResult | null {
  const visitKey = callTargetVisitKey(target);
  if (visited.includes(visitKey)) return null;

  const param = target.node.parameters[argPosition];
  if (!param || param.dotDotDotToken || !ts.isIdentifier(param.name)) return null;

  const calleeBody = target.node.body;
  if (!calleeBody) return null;

  return followChain(
    Array.from(calleeBody.statements),
    param.name.text,
    null,
    projectIndex,
    [],
    [...visited, visitKey],
    [...chainLabels, callTargetLabel(target)]
  );
}

function findJoinedLoopInBody(stmts: ts.Statement[], trackedVar: string, chainLabels: string[]): JoinResult | null {
  const inner = findLoopInStatements(stmts);
  if (!inner) return null;

  if (inner.itemName) {
    const signature = findJoinSignature(inner.bodyStatements, trackedVar, inner.itemName);
    if (signature) return buildJoinResult(signature, inner, (inner.collectionExpr && exprLabel(inner.collectionExpr)) ?? inner.itemName, chainLabels);
  }

  if (inner.kind === 'for' && inner.collectionExpr && inner.indexName) {
    const signature = findVariableAgainstIndexedJoinSignature(inner.bodyStatements, trackedVar, {
      collectionExpr: inner.collectionExpr,
      indexName: inner.indexName,
    });
    if (signature) return buildJoinResult(signature, inner, exprLabel(inner.collectionExpr) ?? inner.indexName, chainLabels);
  }

  return null;
}

function buildJoinResult(signature: JoinSignature, inner: LoopLike, innerCollectionName: string, chainLabels: string[]): JoinResult {
  const innerPrecedingStmts = findPrecedingStatements(inner.node);
  const innerClass = inner.collectionExpr ? classifyCollectionSize(inner.collectionExpr, innerPrecedingStmts) : 'unknown';

  return {
    signature,
    innerCollectionName,
    innerCollectionSize: innerClass,
    innerFilePath: inner.node.getSourceFile().fileName,
    innerLine: lineOf(inner.node.getSourceFile(), inner.node),
    chainLabels,
    innerBoundsToOnePass: boundsToOnePass(inner.bodyStatements, inner.kind),
  };
}

function findRootedArgPosition(call: ts.CallExpression, trackedVar: string): number | null {
  for (let i = 0; i < call.arguments.length; i++) {
    if (ts.isSpreadElement(call.arguments[i])) return null;
    if (isRootedIn(call.arguments[i], trackedVar)) return i;
  }
  return null;
}

function findIndexedArgPosition(call: ts.CallExpression, origin: IndexedOrigin): number | null {
  for (let i = 0; i < call.arguments.length; i++) {
    if (ts.isSpreadElement(call.arguments[i])) return null;
    if (isRootedInIndexedAccess(call.arguments[i], origin.collectionExpr, origin.indexName)) return i;
  }
  return null;
}

function resolveForwardedCallback(
  call: ts.CallExpression,
  trackedVar: string | null,
  indexedOrigin: IndexedOrigin | null,
  projectIndex: AnalysisContext['projectIndex']
): CallTarget | null {
  if (!ts.isPropertyAccessExpression(call.expression) || !FORWARDING_METHODS.has(call.expression.name.text)) return null;
  if (call.arguments.length === 0) return null;

  const callback = call.arguments[call.arguments.length - 1];
  if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) return null;

  const receiver = call.expression.expression;
  const rooted = indexedOrigin
    ? isRootedInIndexedAccess(receiver, indexedOrigin.collectionExpr, indexedOrigin.indexName)
    : trackedVar
      ? isRootedIn(receiver, trackedVar)
      : false;
  if (!rooted) return null;

  return resolveCallableReference(callback, projectIndex);
}

function callTargetVisitKey(target: CallTarget): string {
  return target.ownerClassName ? `${target.filePath}#${target.ownerClassName}.${target.name}` : `${target.filePath}#${target.name}`;
}

function callTargetLabel(target: CallTarget): string {
  return target.ownerClassName ? `${target.ownerClassName}.${target.name}()` : `${target.name}()`;
}

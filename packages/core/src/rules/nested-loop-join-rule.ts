// packages/core/src/rules/nested-loop-join-rule.ts
import type * as ts from 'typescript';
import type { LoopLike } from '../ast/loop-like.js';
import { findDirectNestedLoop } from '../ast/nested-loop-finder.js';
import {
  findJoinSignature,
  findIndexedJoinSignature,
  findVariableAgainstIndexedJoinSignature,
  findIndexedAgainstVariableJoinSignature,
  type IndexedBinding,
  type JoinSignature,
} from '../ast/join-signature-matcher.js';
import { classifyCollectionSize } from '../ast/collection-size-classifier.js';
import { boundsToOnePass } from '../ast/loop-early-exit-analyzer.js';
import { complexityForJoin, complexityIndexedForm } from '../complexity/complexity-label.js';
import { exprLabel } from '../ast/expr-label.js';
import { type LoopRule, type Finding, type AnalysisContext, lineOf } from './loop-rule.js';

function indexedBinding(loop: LoopLike): IndexedBinding | null {
  return loop.kind === 'for' && loop.collectionExpr && loop.indexName
    ? { collectionExpr: loop.collectionExpr, indexName: loop.indexName }
    : null;
}

function matchSignature(outer: LoopLike, inner: LoopLike): JoinSignature | null {
  if (outer.itemName && inner.itemName) {
    return findJoinSignature(inner.bodyStatements, outer.itemName, inner.itemName);
  }

  const outerIndexed = indexedBinding(outer);
  const innerIndexed = indexedBinding(inner);

  if (outerIndexed && innerIndexed) return findIndexedJoinSignature(inner.bodyStatements, outerIndexed, innerIndexed);
  if (outer.itemName && innerIndexed) return findVariableAgainstIndexedJoinSignature(inner.bodyStatements, outer.itemName, innerIndexed);
  if (outerIndexed && inner.itemName) return findIndexedAgainstVariableJoinSignature(inner.bodyStatements, outerIndexed, inner.itemName);

  return null;
}

function collectionLabel(loop: LoopLike): string {
  const fallback = loop.itemName ?? loop.indexName ?? '?';
  return (loop.collectionExpr && exprLabel(loop.collectionExpr)) ?? fallback;
}

function subjectLabel(loop: LoopLike, collectionName: string): string {
  return loop.itemName ?? `${collectionName}[${loop.indexName}]`;
}

export const nestedLoopJoinRule: LoopRule = {
  id: 'nested-loop-join',

  check(loop: LoopLike, precedingStmts: ts.Statement[], ctx: AnalysisContext): Finding | null {
    const inner = findDirectNestedLoop(loop);
    if (!inner) return null;

    const signature = matchSignature(loop, inner);
    if (!signature) return null;

    const outerClass = loop.collectionExpr ? classifyCollectionSize(loop.collectionExpr, precedingStmts) : 'unknown';
    const innerClass = inner.collectionExpr ? classifyCollectionSize(inner.collectionExpr, precedingStmts) : 'unknown';
    if (outerClass === 'fixedSmall' || innerClass === 'fixedSmall') return null;

    if (boundsToOnePass(loop.bodyStatements, loop.kind) || boundsToOnePass(inner.bodyStatements, inner.kind)) return null;

    const outerCollectionName = collectionLabel(loop);
    const innerCollectionName = collectionLabel(inner);
    const sameCollection = outerCollectionName === innerCollectionName;

    const before = complexityForJoin(outerCollectionName, innerCollectionName, sameCollection);
    const after = complexityIndexedForm(outerCollectionName, innerCollectionName, sameCollection);
    const outerSubject = subjectLabel(loop, outerCollectionName);
    const innerSubject = subjectLabel(inner, innerCollectionName);

    const message =
      `Potential ${sameCollection ? 'O(n²)' : 'O(n × m)'} algorithm: every ${outerSubject} is compared against ` +
      `every ${innerSubject} using ${signature.outerDisplay} vs ${signature.innerDisplay}. Estimated complexity: ${before}.`;

    const tip =
      `Index ${innerCollectionName} by ${signature.innerKey} before the loop, then look up matches instead of ` +
      `scanning. Possible complexity after optimization: ${after}.`;

    return { ruleId: 'nested-loop-join', line: lineOf(ctx.sourceFile, loop.node), message, tip };
  },
};

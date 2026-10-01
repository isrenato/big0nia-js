// packages/core/src/rules/repeated-sort-in-loop-rule.ts
import * as ts from 'typescript';
import type { LoopLike } from '../ast/loop-like.js';
import { statementsOf } from '../ast/loop-collector.js';
import { classifyCollectionSize } from '../ast/collection-size-classifier.js';
import { ASSIGNMENT_OPERATORS } from '../ast/class-member-resolver.js';
import { type LoopRule, type Finding, type AnalysisContext, lineOf } from './loop-rule.js';

const MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'fill', 'copyWithin', 'reverse']);
const UPDATE_OPERATORS = new Set([ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken]);

interface SortCallMatch {
  call: ts.CallExpression;
  varName: string;
}

function matchSortCall(call: ts.CallExpression): SortCallMatch | null {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== 'sort') return null;
  if (!ts.isIdentifier(call.expression.expression)) return null;
  return { call, varName: call.expression.expression.text };
}

function findSortCall(stmts: ts.Statement[]): SortCallMatch | null {
  for (const stmt of stmts) {
    if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
      const match = matchSortCall(stmt.expression);
      if (match) return match;
    }

    if (ts.isIfStatement(stmt)) {
      const found = findSortCall(statementsOf(stmt.thenStatement));
      if (found) return found;

      if (stmt.elseStatement) {
        const elseStmts = ts.isIfStatement(stmt.elseStatement) ? [stmt.elseStatement] : statementsOf(stmt.elseStatement);
        const foundElse = findSortCall(elseStmts);
        if (foundElse) return foundElse;
      }
    }
  }

  return null;
}

function isRootedInVariable(node: ts.Node, varName: string): boolean {
  if (ts.isIdentifier(node)) return node.text === varName;
  if (ts.isElementAccessExpression(node)) return isRootedInVariable(node.expression, varName);
  return false;
}

function isMutation(node: ts.Node, varName: string): boolean {
  if (ts.isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)) {
    return isRootedInVariable(node.left, varName);
  }

  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && UPDATE_OPERATORS.has(node.operator)) {
    return isRootedInVariable(node.operand, varName);
  }

  if (ts.isDeleteExpression(node)) return isRootedInVariable(node.expression, varName);

  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    MUTATING_METHODS.has(node.expression.name.text) &&
    isRootedInVariable(node.expression.expression, varName)
  );
}

function isModifiedInSubtree(nodes: readonly ts.Node[], varName: string): boolean {
  for (const node of nodes) {
    if (isMutation(node, varName)) return true;
    if (ts.forEachChild(node, (child) => isModifiedInSubtree([child], varName))) return true;
  }
  return false;
}

export const repeatedSortInLoopRule: LoopRule = {
  id: 'repeated-sort-in-loop',

  check(loop: LoopLike, precedingStmts: ts.Statement[], ctx: AnalysisContext): Finding | null {
    const match = findSortCall(loop.bodyStatements);
    if (!match) return null;

    if (isModifiedInSubtree(loop.bodyStatements, match.varName)) return null;
    if (loop.collectionExpr && classifyCollectionSize(loop.collectionExpr, precedingStmts) === 'fixedSmall') return null;

    const { varName } = match;
    const message = `Potential wasted work: ${varName}.sort(...) re-sorts ${varName} on every iteration, but ${varName} is never modified inside this loop.`;
    const tip = `Move ${varName}.sort(...) above the loop — sorting an already-sorted, unchanged array repeatedly wastes work per iteration for no benefit.`;

    return { ruleId: 'repeated-sort-in-loop', line: lineOf(ctx.sourceFile, match.call), message, tip };
  },
};

// packages/core/src/rules/linear-scan-in-loop-rule.ts
import * as ts from 'typescript';
import type { LoopLike } from '../ast/loop-like.js';
import { statementsOf } from '../ast/loop-collector.js';
import { isRootedIn, isRootedInIndexedAccess } from '../ast/join-signature-matcher.js';
import { classifyCollectionSize } from '../ast/collection-size-classifier.js';
import { boundsToOnePass } from '../ast/loop-early-exit-analyzer.js';
import { complexityForJoin, complexityIndexedForm } from '../complexity/complexity-label.js';
import { exprLabel } from '../ast/expr-label.js';
import { type LoopRule, type Finding, type AnalysisContext, lineOf } from './loop-rule.js';

const SCAN_METHODS = new Set(['includes', 'indexOf', 'find']);
const EQUALITY_OPERATORS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

type NeedleRootedCheck = (needle: ts.Expression) => boolean;

function predicateComparisonExpr(body: ts.Block | ts.Expression): ts.Expression | null {
  if (!ts.isBlock(body)) return body;
  if (body.statements.length !== 1) return null;
  const only = body.statements[0];
  return ts.isReturnStatement(only) && only.expression ? only.expression : null;
}

function isFindPredicateRooted(predicate: ts.Expression, isNeedleRooted: NeedleRootedCheck): boolean {
  if (!ts.isArrowFunction(predicate) && !ts.isFunctionExpression(predicate)) return false;

  const comparison = predicateComparisonExpr(predicate.body);
  if (!comparison || !ts.isBinaryExpression(comparison) || !EQUALITY_OPERATORS.has(comparison.operatorToken.kind)) return false;

  return isNeedleRooted(comparison.left) || isNeedleRooted(comparison.right);
}

function findScanCallInExpr(expr: ts.Expression, isNeedleRooted: NeedleRootedCheck): ts.CallExpression | null {
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return findScanCallInExpr(expr.left, isNeedleRooted) ?? findScanCallInExpr(expr.right, isNeedleRooted);
  }

  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    return findScanCallInExpr(expr.operand, isNeedleRooted);
  }

  if (!ts.isCallExpression(expr) || !ts.isPropertyAccessExpression(expr.expression)) return null;

  const methodName = expr.expression.name.text;
  if (!SCAN_METHODS.has(methodName) || expr.arguments.length === 0) return null;

  if (methodName === 'find') {
    return isFindPredicateRooted(expr.arguments[0], isNeedleRooted) ? expr : null;
  }

  return isNeedleRooted(expr.arguments[0]) ? expr : null;
}

function findScanCall(stmts: ts.Statement[], isNeedleRooted: NeedleRootedCheck): ts.CallExpression | null {
  for (const stmt of stmts) {
    if (!ts.isIfStatement(stmt)) continue;

    const call = findScanCallInExpr(stmt.expression, isNeedleRooted);
    if (call) return call;

    const nested = findScanCall(statementsOf(stmt.thenStatement), isNeedleRooted);
    if (nested) return nested;
  }

  return null;
}

export const linearScanInLoopRule: LoopRule = {
  id: 'linear-scan-in-loop',

  check(loop: LoopLike, precedingStmts: ts.Statement[], ctx: AnalysisContext): Finding | null {
    let outerLabel: string;
    let outerCollectionName: string;
    let isNeedleRooted: NeedleRootedCheck;

    if (loop.kind === 'for') {
      if (!loop.collectionExpr || !loop.indexName) return null;
      const collectionExpr = loop.collectionExpr;
      const indexName = loop.indexName;
      outerCollectionName = exprLabel(collectionExpr) ?? indexName;
      outerLabel = `${outerCollectionName}[${indexName}]`;
      isNeedleRooted = (needle) => isRootedInIndexedAccess(needle, collectionExpr, indexName);
    } else {
      if (!loop.itemName) return null;
      const itemName = loop.itemName;
      outerLabel = itemName;
      outerCollectionName = (loop.collectionExpr && exprLabel(loop.collectionExpr)) ?? itemName;
      isNeedleRooted = (needle) => isRootedIn(needle, itemName);
    }

    const call = findScanCall(loop.bodyStatements, isNeedleRooted);
    if (!call) return null;

    if (boundsToOnePass(loop.bodyStatements, loop.kind)) return null;

    const haystackExpr = (call.expression as ts.PropertyAccessExpression).expression;
    if (classifyCollectionSize(haystackExpr, precedingStmts) === 'fixedSmall') return null;

    const haystackName = exprLabel(haystackExpr) ?? 'the collection';
    if (loop.collectionExpr && exprLabel(loop.collectionExpr) === haystackName) return null;

    const methodName = (call.expression as ts.PropertyAccessExpression).name.text;
    const before = complexityForJoin(outerCollectionName, haystackName, false);
    const after = complexityIndexedForm(outerCollectionName, haystackName, false);

    const message =
      `Potential O(n × m) algorithm: every ${outerLabel} is checked against ` +
      `${haystackName} using ${methodName}(). Estimated complexity: ${before}.`;
    const tip = `Convert ${haystackName} to a Set/Map before the loop, then use .has()/.get() instead of ${methodName}(). Possible complexity after optimization: ${after}.`;

    return { ruleId: 'linear-scan-in-loop', line: lineOf(ctx.sourceFile, loop.node), message, tip };
  },
};

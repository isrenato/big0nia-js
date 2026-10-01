// packages/core/src/rules/array-rebuild-in-loop-rule.ts
import * as ts from 'typescript';
import type { LoopLike } from '../ast/loop-like.js';
import { statementsOf } from '../ast/loop-collector.js';
import { classifyCollectionSize } from '../ast/collection-size-classifier.js';
import { type LoopRule, type Finding, type AnalysisContext, lineOf } from './loop-rule.js';

interface SelfRebuildMatch {
  varName: string;
  form: 'concat' | 'spread';
}

function matchSelfRebuild(assignment: ts.BinaryExpression): SelfRebuildMatch | null {
  if (!ts.isIdentifier(assignment.left)) return null;
  const varName = assignment.left.text;

  const isTarget = (expr: ts.Expression): boolean => ts.isIdentifier(expr) && expr.text === varName;

  if (
    ts.isCallExpression(assignment.right) &&
    ts.isPropertyAccessExpression(assignment.right.expression) &&
    assignment.right.expression.name.text === 'concat' &&
    (isTarget(assignment.right.expression.expression) || assignment.right.arguments.some(isTarget))
  ) {
    return { varName, form: 'concat' };
  }

  if (
    ts.isArrayLiteralExpression(assignment.right) &&
    assignment.right.elements.some((el) => ts.isSpreadElement(el) && isTarget(el.expression))
  ) {
    return { varName, form: 'spread' };
  }

  return null;
}

function findSelfRebuildAssignment(stmts: ts.Statement[]): SelfRebuildMatch | null {
  for (const stmt of stmts) {
    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression) && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const match = matchSelfRebuild(stmt.expression);
      if (match) return match;
    }

    if (ts.isIfStatement(stmt)) {
      const found = findSelfRebuildAssignment(statementsOf(stmt.thenStatement));
      if (found) return found;

      if (stmt.elseStatement) {
        const elseStmts = ts.isIfStatement(stmt.elseStatement) ? [stmt.elseStatement] : statementsOf(stmt.elseStatement);
        const foundElse = findSelfRebuildAssignment(elseStmts);
        if (foundElse) return foundElse;
      }
    }
  }

  return null;
}

export const arrayRebuildInLoopRule: LoopRule = {
  id: 'array-rebuild-in-loop',

  check(loop: LoopLike, precedingStmts: ts.Statement[], ctx: AnalysisContext): Finding | null {
    const match = findSelfRebuildAssignment(loop.bodyStatements);
    if (!match) return null;

    if (loop.collectionExpr && classifyCollectionSize(loop.collectionExpr, precedingStmts) === 'fixedSmall') return null;

    const { varName, form } = match;
    const expr = form === 'concat' ? `${varName}.concat(...)` : `[...${varName}, ...]`;

    const message = `Potential O(n²) algorithm: ${expr} rebuilds ${varName} from scratch on every iteration.`;
    const tip = `Replace ${expr} with ${varName}.push(...) (or an equivalent append), or build the pieces separately and concatenate once after the loop.`;

    return { ruleId: 'array-rebuild-in-loop', line: lineOf(ctx.sourceFile, loop.node), message, tip };
  },
};

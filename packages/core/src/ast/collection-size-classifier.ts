import * as ts from 'typescript';
import { findPropertyDefaultArray } from './class-member-resolver.js';

export type CollectionSize = 'fixedSmall' | 'unknown';

function classifyBySize(array: ts.ArrayLiteralExpression): CollectionSize {
  return array.elements.length === 0 ? 'unknown' : 'fixedSmall';
}

function findLastArrayAssignment(varName: string, stmts: ts.Statement[]): ts.ArrayLiteralExpression | null {
  let found: ts.ArrayLiteralExpression | null = null;

  for (const stmt of stmts) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === varName) {
          found = decl.initializer && ts.isArrayLiteralExpression(decl.initializer) ? decl.initializer : null;
        }
      }
      continue;
    }

    if (ts.isExpressionStatement(stmt) && ts.isBinaryExpression(stmt.expression) && stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const { left, right } = stmt.expression;
      if (ts.isIdentifier(left) && left.text === varName) {
        found = ts.isArrayLiteralExpression(right) ? right : null;
      }
    }
  }

  return found;
}

export function classifyCollectionSize(expr: ts.Expression, precedingStmts: ts.Statement[]): CollectionSize {
  if (ts.isArrayLiteralExpression(expr)) {
    return classifyBySize(expr);
  }

  if (ts.isIdentifier(expr)) {
    const literal = findLastArrayAssignment(expr.text, precedingStmts);
    if (literal) return classifyBySize(literal);
  }

  if (ts.isPropertyAccessExpression(expr) && expr.expression.kind === ts.SyntaxKind.ThisKeyword) {
    const literal = findPropertyDefaultArray(expr, expr.name.text);
    if (literal) return classifyBySize(literal);
  }

  return 'unknown';
}

// packages/core/src/ast/call-site-finder.ts
import * as ts from 'typescript';
import { statementsOf } from './loop-collector.js';

export interface CallSite {
  call: ts.CallExpression;
  precedingStmts: ts.Statement[];
}

function extractCall(expr: ts.Expression): ts.CallExpression | null {
  if (ts.isCallExpression(expr)) return expr;
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return extractCall(expr.right);
  }
  return null;
}

function stmtCallExpr(stmt: ts.Statement): ts.Expression | null {
  if (ts.isExpressionStatement(stmt)) return stmt.expression;
  if (ts.isReturnStatement(stmt) && stmt.expression) return stmt.expression;

  if (ts.isVariableStatement(stmt)) {
    const decls = stmt.declarationList.declarations;
    if (decls.length === 1 && decls[0].initializer) return decls[0].initializer;
  }

  return null;
}

export function findAllCallSites(stmts: ts.Statement[]): CallSite[] {
  const sites: CallSite[] = [];

  stmts.forEach((stmt, index) => {
    const expr = stmtCallExpr(stmt);
    if (expr) {
      const call = extractCall(expr);
      if (call) sites.push({ call, precedingStmts: stmts.slice(0, index) });
      return;
    }

    if (ts.isIfStatement(stmt)) {
      const prefix = stmts.slice(0, index);
      for (const nested of findAllCallSites(statementsOf(stmt.thenStatement))) {
        sites.push({ call: nested.call, precedingStmts: [...prefix, ...nested.precedingStmts] });
      }
    }
  });

  return sites;
}

import * as ts from 'typescript';

export function boundsToOnePass(stmts: ts.Statement[]): boolean {
  for (const stmt of stmts) {
    if (ts.isBreakStatement(stmt) && stmt.label === undefined) return true;
    if (ts.isReturnStatement(stmt)) return true;
    if (ts.isThrowStatement(stmt)) return true;
  }

  return false;
}

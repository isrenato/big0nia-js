import * as ts from 'typescript';
import type { LoopKind } from './loop-like.js';

export function boundsToOnePass(stmts: ts.Statement[], kind: LoopKind): boolean {
  for (const stmt of stmts) {
    if (kind === 'forEach') {
      if (ts.isThrowStatement(stmt)) return true;
      continue;
    }

    if (ts.isBreakStatement(stmt) && stmt.label === undefined) return true;
    if (ts.isReturnStatement(stmt)) return true;
    if (ts.isThrowStatement(stmt)) return true;
  }

  return false;
}

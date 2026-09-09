import * as ts from 'typescript';
import type { LoopLike } from './loop-like.js';
import { matchLoopLikeStatement, statementsOf } from './loop-collector.js';

export function findDirectNestedLoop(loop: LoopLike): LoopLike | null {
  return findInStatements(loop.bodyStatements);
}

function findInStatements(stmts: ts.Statement[]): LoopLike | null {
  for (const stmt of stmts) {
    const nestedLoop = matchLoopLikeStatement(stmt);
    if (nestedLoop) return nestedLoop;

    if (ts.isIfStatement(stmt)) {
      const nested = findInStatements(statementsOf(stmt.thenStatement));
      if (nested) return nested;
    }
  }

  return null;
}

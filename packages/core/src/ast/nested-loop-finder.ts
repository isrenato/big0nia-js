import * as ts from 'typescript';
import type { LoopLike } from './loop-like.js';
import { matchLoopLike, matchLoopLikeStatement, statementsOf } from './loop-collector.js';

export function findDirectNestedLoop(loop: LoopLike): LoopLike | null {
  const found = findInStatements(loop.bodyStatements);
  if (found) return found;

  if (loop.bodyExpression) return matchLoopLike(loop.bodyExpression);

  return null;
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

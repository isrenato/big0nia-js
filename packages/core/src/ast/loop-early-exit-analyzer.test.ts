import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { boundsToOnePass } from './loop-early-exit-analyzer.js';
import { parseSource } from '../test-support/parse-source.js';

function blockStatements(body: string): ts.Statement[] {
  const file = parseSource(`function wrapper() { ${body} }`);
  const fn = file.statements[0] as ts.FunctionDeclaration;
  return Array.from(fn.body!.statements);
}

describe('boundsToOnePass', () => {
  it('is true for an unconditional break', () => {
    expect(boundsToOnePass(blockStatements('break;'))).toBe(true);
  });

  it('is true for an unconditional return', () => {
    expect(boundsToOnePass(blockStatements('return;'))).toBe(true);
  });

  it('is true for an unconditional throw', () => {
    expect(boundsToOnePass(blockStatements('throw new Error("x");'))).toBe(true);
  });

  it('is false for a labeled break (target not resolved, treated conservatively)', () => {
    expect(boundsToOnePass(blockStatements('break outer;'))).toBe(false);
  });

  it('is false when the exit is nested inside an if', () => {
    expect(boundsToOnePass(blockStatements('if (x) { break; }'))).toBe(false);
  });

  it('is false for a loop body with no early exit', () => {
    expect(boundsToOnePass(blockStatements('console.log(1);'))).toBe(false);
  });
});

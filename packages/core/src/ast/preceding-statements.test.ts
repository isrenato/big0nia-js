import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { findPrecedingStatements } from './preceding-statements.js';
import { parseSource } from '../test-support/parse-source.js';

describe('findPrecedingStatements', () => {
  it('returns statements before the target in a function block', () => {
    const file = parseSource(`
      function wrapper() {
        const a = 1;
        const b = 2;
        const c = 3;
      }
    `);
    const fn = file.statements[0] as ts.FunctionDeclaration;
    const stmts = fn.body!.statements;
    const preceding = findPrecedingStatements(stmts[2]);
    expect(preceding).toEqual([stmts[0], stmts[1]]);
  });

  it('returns an empty array for the first statement in a block', () => {
    const file = parseSource(`
      function wrapper() {
        const a = 1;
      }
    `);
    const fn = file.statements[0] as ts.FunctionDeclaration;
    expect(findPrecedingStatements(fn.body!.statements[0])).toEqual([]);
  });

  it('returns statements before the target at the top level of a source file', () => {
    const file = parseSource(`
      const a = 1;
      const b = 2;
    `);
    expect(findPrecedingStatements(file.statements[1])).toEqual([file.statements[0]]);
  });

  it('returns an empty array for a node with no statement-list parent', () => {
    const file = parseSource('const a = 1;');
    const decl = (file.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    expect(findPrecedingStatements(decl)).toEqual([]);
  });

  it('climbs through an ExpressionStatement wrapper to find preceding statements for a .forEach() call', () => {
    const file = parseSource(`
      const roles = ["a","b"];
      roles.forEach((r) => { use(r); });
    `);
    const secondStmt = file.statements[1] as ts.ExpressionStatement;
    const callExpr = secondStmt.expression as ts.CallExpression;
    const preceding = findPrecedingStatements(callExpr);
    expect(preceding).toHaveLength(1);
    expect(preceding[0]).toBe(file.statements[0]);
  });
});

import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { classifyCollectionSize } from './collection-size-classifier.js';
import { parseSource } from '../test-support/parse-source.js';

function expressionStatementExpr(stmts: readonly ts.Statement[], index: number): ts.Expression {
  const stmt = stmts[index];
  if (!ts.isExpressionStatement(stmt)) throw new Error('expected an expression statement');
  return stmt.expression;
}

describe('classifyCollectionSize', () => {
  it('classifies a non-empty array literal as fixedSmall', () => {
    const file = parseSource('[1, 2, 3];');
    expect(classifyCollectionSize(expressionStatementExpr(file.statements, 0), [])).toBe('fixedSmall');
  });

  it('classifies an empty array literal as unknown', () => {
    const file = parseSource('[];');
    expect(classifyCollectionSize(expressionStatementExpr(file.statements, 0), [])).toBe('unknown');
  });

  it('classifies a variable last assigned an array literal as fixedSmall', () => {
    const file = parseSource(`
      const roles = ['admin', 'editor'];
      roles;
    `);
    const preceding = [file.statements[0]];
    expect(classifyCollectionSize(expressionStatementExpr(file.statements, 1), preceding)).toBe('fixedSmall');
  });

  it('classifies a variable whose last assignment is not an array literal as unknown', () => {
    const file = parseSource(`
      let roles = ['admin'];
      roles = fetchRoles();
      roles;
    `);
    const preceding = [file.statements[0], file.statements[1]];
    expect(classifyCollectionSize(expressionStatementExpr(file.statements, 2), preceding)).toBe('unknown');
  });

  it('classifies an untraceable variable as unknown', () => {
    const file = parseSource('items;');
    expect(classifyCollectionSize(expressionStatementExpr(file.statements, 0), [])).toBe('unknown');
  });

  it('classifies a class field with an array-literal default as fixedSmall', () => {
    const file = parseSource(`
      class Service {
        roles = ['admin', 'editor'];
        check() {
          this.roles;
        }
      }
    `);
    const classNode = file.statements[0] as ts.ClassDeclaration;
    const method = classNode.members.find(ts.isMethodDeclaration)!;
    const stmt = method.body!.statements[0] as ts.ExpressionStatement;
    expect(classifyCollectionSize(stmt.expression, [])).toBe('fixedSmall');
  });

  it('classifies a class field reassigned elsewhere in the class as unknown', () => {
    const file = parseSource(`
      class Service {
        roles = ['admin'];
        reset() {
          this.roles = [];
        }
        check() {
          this.roles;
        }
      }
    `);
    const classNode = file.statements[0] as ts.ClassDeclaration;
    const checkMethod = classNode.members
      .filter(ts.isMethodDeclaration)
      .find((m) => ts.isIdentifier(m.name) && m.name.text === 'check')!;
    const stmt = checkMethod.body!.statements[0] as ts.ExpressionStatement;
    expect(classifyCollectionSize(stmt.expression, [])).toBe('unknown');
  });
});

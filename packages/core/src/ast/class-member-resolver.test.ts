import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { findPropertyDefaultArray } from './class-member-resolver.js';
import { parseSource } from '../test-support/parse-source.js';

function firstMethodFirstStatementExpr(source: string, methodName: string): ts.Expression {
  const file = parseSource(source);
  const classNode = file.statements[0] as ts.ClassDeclaration;
  const method = classNode.members
    .filter(ts.isMethodDeclaration)
    .find((m) => ts.isIdentifier(m.name) && m.name.text === methodName)!;
  const stmt = method.body!.statements[0] as ts.ExpressionStatement;
  return stmt.expression;
}

describe('findPropertyDefaultArray', () => {
  it('resolves a declared property default array literal', () => {
    const expr = firstMethodFirstStatementExpr(
      `
      class Service {
        roles = ['admin', 'editor'];
        check() {
          this.roles;
        }
      }
      `,
      'check'
    );
    const result = findPropertyDefaultArray(expr, 'roles');
    expect(result?.elements).toHaveLength(2);
  });

  it('resolves a constructor-promoted property default array literal', () => {
    const expr = firstMethodFirstStatementExpr(
      `
      class Service {
        constructor(private readonly roles: string[] = ['admin']) {}
        check() {
          this.roles;
        }
      }
      `,
      'check'
    );
    const result = findPropertyDefaultArray(expr, 'roles');
    expect(result?.elements).toHaveLength(1);
  });

  it('returns null when the property has no array-literal default', () => {
    const expr = firstMethodFirstStatementExpr(
      `
      class Service {
        roles;
        check() {
          this.roles;
        }
      }
      `,
      'check'
    );
    expect(findPropertyDefaultArray(expr, 'roles')).toBeNull();
  });

  it('returns null when the property is reassigned elsewhere in the class', () => {
    const expr = firstMethodFirstStatementExpr(
      `
      class Service {
        roles = ['admin'];
        reset() {
          this.roles = [];
        }
        check() {
          this.roles;
        }
      }
      `,
      'check'
    );
    expect(findPropertyDefaultArray(expr, 'roles')).toBeNull();
  });

  it('returns null when the property is reassigned using **= operator', () => {
    const expr = firstMethodFirstStatementExpr(
      `
      class Service {
        multiplier = [2];
        update() {
          this.multiplier **= [4];
        }
        check() {
          this.multiplier;
        }
      }
      `,
      'check'
    );
    expect(findPropertyDefaultArray(expr, 'multiplier')).toBeNull();
  });

  it('returns null for every assignment operator in ASSIGNMENT_OPERATORS', () => {
    const operators = [
      '=',
      '+=',
      '-=',
      '*=',
      '**=',
      '/=',
      '%=',
      '<<=',
      '>>=',
      '>>>=',
      '&=',
      '|=',
      '||=',
      '&&=',
      '??=',
      '^=',
    ];

    for (const op of operators) {
      const expr = firstMethodFirstStatementExpr(
        `
        class Service {
          roles = ['admin'];
          update() {
            this.roles ${op} [1];
          }
          check() {
            this.roles;
          }
        }
        `,
        'check'
      );
      expect(findPropertyDefaultArray(expr, 'roles')).toBeNull();
    }
  });

  it('returns null when there is no enclosing class', () => {
    const file = parseSource('this.roles;');
    const stmt = file.statements[0] as ts.ExpressionStatement;
    expect(findPropertyDefaultArray(stmt.expression, 'roles')).toBeNull();
  });
});

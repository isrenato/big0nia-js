// packages/core/src/ast/expr-label.test.ts
import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { exprLabel } from './expr-label.js';
import { parseSource } from '../test-support/parse-source.js';

function firstExprStatementExpr(source: string): ts.Expression {
  const file = parseSource(source);
  return (file.statements[0] as ts.ExpressionStatement).expression;
}

describe('exprLabel', () => {
  it('labels a bare identifier', () => {
    expect(exprLabel(firstExprStatementExpr('orders;'))).toBe('orders');
  });

  it('labels a this-rooted property access', () => {
    expect(exprLabel(firstExprStatementExpr('this.orders;'))).toBe('this.orders');
  });

  it('labels a multi-level property chain', () => {
    expect(exprLabel(firstExprStatementExpr('this.repo.orders;'))).toBe('this.repo.orders');
  });

  it('returns null for an expression with no simple label', () => {
    expect(exprLabel(firstExprStatementExpr('getOrders();'))).toBeNull();
  });
});

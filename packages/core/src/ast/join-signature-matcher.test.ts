import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { findJoinSignature, isRootedIn } from './join-signature-matcher.js';
import { parseSource } from '../test-support/parse-source.js';

function ifStatements(condition: string): ts.Statement[] {
  const file = parseSource(`if (${condition}) { doThing(); }`);
  return Array.from(file.statements);
}

describe('findJoinSignature', () => {
  it('matches a method-call equality comparison', () => {
    const signature = findJoinSignature(ifStatements('user.getId() === order.getUserId()'), 'user', 'order');
    expect(signature).toEqual({ outerDisplay: 'getId()', innerDisplay: 'getUserId()', innerKey: 'userId' });
  });

  it('matches a property-access equality comparison', () => {
    const signature = findJoinSignature(ifStatements('user.id === order.userId'), 'user', 'order');
    expect(signature).toEqual({ outerDisplay: 'id', innerDisplay: 'userId', innerKey: 'userId' });
  });

  it('matches regardless of which side the tracked names are on', () => {
    const signature = findJoinSignature(ifStatements('order.userId === user.id'), 'user', 'order');
    expect(signature).toEqual({ outerDisplay: 'id', innerDisplay: 'userId', innerKey: 'userId' });
  });

  it('matches through optional chaining', () => {
    expect(findJoinSignature(ifStatements('user?.id === order?.userId'), 'user', 'order')).not.toBeNull();
  });

  it('matches !== as well as ===', () => {
    expect(findJoinSignature(ifStatements('user.id !== order.userId'), 'user', 'order')).not.toBeNull();
  });

  it('matches when combined with && at any depth', () => {
    const signature = findJoinSignature(
      ifStatements('order.isPaid() && user.getId() === order.getUserId()'),
      'user',
      'order'
    );
    expect(signature).not.toBeNull();
  });

  it('matches a second equality comparison in an && chain when the first does not match', () => {
    const signature = findJoinSignature(
      ifStatements('a.x === b.y && user.getId() === order.getUserId()'),
      'user',
      'order'
    );
    expect(signature).toEqual({ outerDisplay: 'getId()', innerDisplay: 'getUserId()', innerKey: 'userId' });
  });

  it('does not match when neither side is rooted in the tracked names', () => {
    expect(findJoinSignature(ifStatements('a.x === b.y'), 'user', 'order')).toBeNull();
  });

  it('does not match a comparison combined with ||', () => {
    expect(findJoinSignature(ifStatements('user.getId() === order.getUserId() || true'), 'user', 'order')).toBeNull();
  });

  it('does not match a bare identifier comparison with no describable accessor', () => {
    expect(findJoinSignature(ifStatements('user === order'), 'user', 'order')).toBeNull();
  });
});

describe('isRootedIn', () => {
  function firstExprStatementExpr(source: string): ts.Expression {
    const file = parseSource(source);
    return (file.statements[0] as ts.ExpressionStatement).expression;
  }

  it('recognizes a bare identifier', () => {
    expect(isRootedIn(firstExprStatementExpr('user;'), 'user')).toBe(true);
  });

  it('recognizes a chained property/method access', () => {
    expect(isRootedIn(firstExprStatementExpr('user.profile.getId();'), 'user')).toBe(true);
  });

  it('recognizes an optional-chained access', () => {
    expect(isRootedIn(firstExprStatementExpr('user?.profile?.id;'), 'user')).toBe(true);
  });

  it('returns false for an unrelated root', () => {
    expect(isRootedIn(firstExprStatementExpr('other.id;'), 'user')).toBe(false);
  });
});

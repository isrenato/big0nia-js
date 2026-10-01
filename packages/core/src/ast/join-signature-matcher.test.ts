import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import {
  findJoinSignature,
  findIndexedAgainstVariableJoinSignature,
  findIndexedJoinSignature,
  findVariableAgainstIndexedJoinSignature,
  isRootedIn,
  isRootedInIndexedAccess,
} from './join-signature-matcher.js';
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

function ifStatementsIn(body: string): ts.Statement[] {
  const file = parseSource(`function wrapper() { ${body} }`);
  const fn = file.statements[0] as ts.FunctionDeclaration;
  return Array.from(fn.body!.statements);
}

function firstExprStatementExpr(source: string): ts.Expression {
  const file = parseSource(source);
  return (file.statements[0] as ts.ExpressionStatement).expression;
}

describe('isRootedInIndexedAccess', () => {
  it('recognizes a bare indexed access matching the binding', () => {
    const usersFile = parseSource('users[i];');
    const usersExpr = ((usersFile.statements[0] as ts.ExpressionStatement).expression as ts.ElementAccessExpression).expression;
    expect(isRootedInIndexedAccess(firstExprStatementExpr('users[i];'), usersExpr, 'i')).toBe(true);
  });

  it('recognizes a property/method chain rooted in the indexed access', () => {
    const usersFile = parseSource('users[i];');
    const usersExpr = ((usersFile.statements[0] as ts.ExpressionStatement).expression as ts.ElementAccessExpression).expression;
    expect(isRootedInIndexedAccess(firstExprStatementExpr('users[i].getId();'), usersExpr, 'i')).toBe(true);
  });

  it('returns false for a different index variable', () => {
    const usersFile = parseSource('users[i];');
    const usersExpr = ((usersFile.statements[0] as ts.ExpressionStatement).expression as ts.ElementAccessExpression).expression;
    expect(isRootedInIndexedAccess(firstExprStatementExpr('users[j];'), usersExpr, 'i')).toBe(false);
  });

  it('returns false for a different collection expression', () => {
    const usersFile = parseSource('users[i];');
    const usersExpr = ((usersFile.statements[0] as ts.ExpressionStatement).expression as ts.ElementAccessExpression).expression;
    expect(isRootedInIndexedAccess(firstExprStatementExpr('orders[i];'), usersExpr, 'i')).toBe(false);
  });

  it('matches a this-rooted collection', () => {
    const boundFile = parseSource('this.users[i];');
    const boundExpr = ((boundFile.statements[0] as ts.ExpressionStatement).expression as ts.ElementAccessExpression).expression;
    expect(isRootedInIndexedAccess(firstExprStatementExpr('this.users[i].id;'), boundExpr, 'i')).toBe(true);
  });
});

describe('findIndexedJoinSignature', () => {
  function binding(collectionSource: string, indexName: string): { collectionExpr: ts.Expression; indexName: string } {
    return { collectionExpr: firstExprStatementExpr(collectionSource), indexName };
  }

  it('matches a property-access equality comparison between two indexed accesses', () => {
    const signature = findIndexedJoinSignature(
      ifStatementsIn('if (users[i].id === orders[j].userId) { doThing(); }'),
      binding('users;', 'i'),
      binding('orders;', 'j')
    );
    expect(signature).toEqual({ outerDisplay: 'id', innerDisplay: 'userId', innerKey: 'userId' });
  });

  it('matches a method-call comparison regardless of side order', () => {
    const signature = findIndexedJoinSignature(
      ifStatementsIn('if (orders[j].getUserId() === users[i].getId()) { doThing(); }'),
      binding('users;', 'i'),
      binding('orders;', 'j')
    );
    expect(signature).toEqual({ outerDisplay: 'getId()', innerDisplay: 'getUserId()', innerKey: 'userId' });
  });

  it('returns null when the indices do not match the bindings', () => {
    expect(
      findIndexedJoinSignature(
        ifStatementsIn('if (users[k].id === orders[j].userId) { doThing(); }'),
        binding('users;', 'i'),
        binding('orders;', 'j')
      )
    ).toBeNull();
  });
});

describe('findVariableAgainstIndexedJoinSignature', () => {
  it('matches a plain tracked variable against an indexed access', () => {
    const signature = findVariableAgainstIndexedJoinSignature(
      ifStatementsIn('if (user.id === orders[j].userId) { doThing(); }'),
      'user',
      { collectionExpr: firstExprStatementExpr('orders;'), indexName: 'j' }
    );
    expect(signature).toEqual({ outerDisplay: 'id', innerDisplay: 'userId', innerKey: 'userId' });
  });

  it('returns null when the tracked variable is not referenced', () => {
    expect(
      findVariableAgainstIndexedJoinSignature(
        ifStatementsIn('if (other.id === orders[j].userId) { doThing(); }'),
        'user',
        { collectionExpr: firstExprStatementExpr('orders;'), indexName: 'j' }
      )
    ).toBeNull();
  });
});

describe('findIndexedAgainstVariableJoinSignature', () => {
  it('matches an indexed outer access against a plain inner item variable', () => {
    const signature = findIndexedAgainstVariableJoinSignature(
      ifStatementsIn('if (order.userId === users[i].id) { doThing(); }'),
      { collectionExpr: firstExprStatementExpr('users;'), indexName: 'i' },
      'order'
    );
    expect(signature).toEqual({ outerDisplay: 'id', innerDisplay: 'userId', innerKey: 'userId' });
  });

  it('returns null when the inner item variable is not referenced', () => {
    expect(
      findIndexedAgainstVariableJoinSignature(
        ifStatementsIn('if (users[i].id === other.userId) { doThing(); }'),
        { collectionExpr: firstExprStatementExpr('users;'), indexName: 'i' },
        'order'
      )
    ).toBeNull();
  });
});

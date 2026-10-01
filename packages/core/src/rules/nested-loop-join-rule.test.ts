// packages/core/src/rules/nested-loop-join-rule.test.ts
import { describe, it, expect } from 'vitest';
import { collectLoops } from '../ast/loop-collector.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import { buildProjectIndex } from '../project/project-index-builder.js';
import { nestedLoopJoinRule } from './nested-loop-join-rule.js';
import { parseSource } from '../test-support/parse-source.js';
import type { AnalysisContext } from './loop-rule.js';

function checkFirstLoop(source: string) {
  const sourceFile = parseSource(source);
  const projectIndex = buildProjectIndex(new Map([[sourceFile.fileName, sourceFile]]));
  const ctx: AnalysisContext = { sourceFile, projectIndex };
  const loop = collectLoops(sourceFile)[0];
  return nestedLoopJoinRule.check(loop, findPrecedingStatements(loop.node), ctx);
}

describe('nestedLoopJoinRule', () => {
  it('flags a for-of/for-of join on unrelated collections', () => {
    const finding = checkFirstLoop(`
      for (const user of users) {
        for (const order of orders) {
          if (user.id === order.userId) {
            console.log(order);
          }
        }
      }
    `);

    expect(finding?.ruleId).toBe('nested-loop-join');
    expect(finding?.message).toBe(
      'Potential O(n × m) algorithm: every user is compared against every order using id vs userId. ' +
        'Estimated complexity: O(users × orders).'
    );
    expect(finding?.tip).toBe(
      'Index orders by userId before the loop, then look up matches instead of scanning. ' +
        'Possible complexity after optimization: O(users + orders).'
    );
  });

  it('uses the squared form when outer and inner share the same collection label', () => {
    const finding = checkFirstLoop(`
      for (const a of items) {
        for (const b of items) {
          if (a.id === b.parentId) {
            console.log(b);
          }
        }
      }
    `);
    expect(finding?.message).toContain('O(items²)');
  });

  it('flags a canonical indexed for/for join', () => {
    const finding = checkFirstLoop(`
      for (let i = 0; i < users.length; i++) {
        for (let j = 0; j < orders.length; j++) {
          if (users[i].id === orders[j].userId) {
            console.log(orders[j]);
          }
        }
      }
    `);

    expect(finding?.message).toBe(
      'Potential O(n × m) algorithm: every users[i] is compared against every orders[j] using id vs userId. ' +
        'Estimated complexity: O(users × orders).'
    );
  });

  it('flags a for-of outer loop joined against an indexed-for inner loop', () => {
    const finding = checkFirstLoop(`
      for (const user of users) {
        for (let j = 0; j < orders.length; j++) {
          if (user.id === orders[j].userId) {
            console.log(orders[j]);
          }
        }
      }
    `);

    expect(finding?.message).toBe(
      'Potential O(n × m) algorithm: every user is compared against every orders[j] using id vs userId. ' +
        'Estimated complexity: O(users × orders).'
    );
  });

  it('flags an indexed-for outer loop joined against a forEach inner loop', () => {
    const finding = checkFirstLoop(`
      for (let i = 0; i < users.length; i++) {
        orders.forEach((order) => {
          if (order.userId === users[i].id) {
            console.log(order);
          }
        });
      }
    `);

    expect(finding?.message).toBe(
      'Potential O(n × m) algorithm: every users[i] is compared against every order using id vs userId. ' +
        'Estimated complexity: O(users × orders).'
    );
    expect(finding?.tip).toBe(
      'Index orders by userId before the loop, then look up matches instead of scanning. ' +
        'Possible complexity after optimization: O(users + orders).'
    );
  });

  it('does not flag when there is no nested loop', () => {
    expect(checkFirstLoop('for (const user of users) { console.log(user); }')).toBeNull();
  });

  it('does not flag when there is no join signature', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          for (const order of orders) {
            console.log(user, order);
          }
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the outer collection is a fixed-size array literal', () => {
    expect(
      checkFirstLoop(`
        for (const user of ['a', 'b']) {
          for (const order of orders) {
            if (user.id === order.userId) {
              console.log(order);
            }
          }
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the inner collection is a fixed-size array literal', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          for (const order of ['a', 'b', 'c']) {
            if (user.id === order.userId) {
              console.log(order);
            }
          }
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the inner loop bounds to one pass via return', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          for (const order of orders) {
            if (user.id === order.userId) {
              console.log(order);
            }
            return;
          }
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the outer loop bounds to one pass via return', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          for (const order of orders) {
            if (user.id === order.userId) {
              console.log(order);
            }
          }
          return;
        }
      `)
    ).toBeNull();
  });
});

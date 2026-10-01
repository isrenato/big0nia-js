// packages/core/src/rules/interprocedural-loop-join-rule.test.ts
import { describe, it, expect } from 'vitest';
import { collectLoops } from '../ast/loop-collector.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import { buildProjectIndex } from '../project/project-index-builder.js';
import { interproceduralLoopJoinRule } from './interprocedural-loop-join-rule.js';
import { parseSource } from '../test-support/parse-source.js';
import type * as ts from 'typescript';
import type { AnalysisContext } from './loop-rule.js';

function checkOuterLoop(sourceFile: ts.SourceFile, otherFiles: ts.SourceFile[] = []) {
  const projectIndex = buildProjectIndex(new Map([sourceFile, ...otherFiles].map((f) => [f.fileName, f])));
  const ctx: AnalysisContext = { sourceFile, projectIndex };
  // Select the loop iterating `users` specifically, rather than the first loop collectLoops finds —
  // collectLoops walks the whole file depth-first in declaration order, so when a helper function is
  // declared before the function containing the loop under test, its own (irrelevant) loop would
  // otherwise be picked up first.
  const loop = collectLoops(sourceFile).find((l) => l.collectionExpr?.getText() === 'users')!;
  return interproceduralLoopJoinRule.check(loop, findPrecedingStatements(loop.node), ctx);
}

describe('interproceduralLoopJoinRule', () => {
  it('flags a join found through a same-file function call', () => {
    const source = parseSource(`
      function matchOrder(user) {
        for (const order of orders) {
          if (user.id === order.userId) {
            console.log(order);
          }
        }
      }

      function run() {
        for (const user of users) {
          matchOrder(user);
        }
      }
    `);

    const finding = checkOuterLoop(source);

    expect(finding?.ruleId).toBe('interprocedural-loop-join');
    expect(finding?.message).toContain('every item is compared against every orders using id vs userId, via matchOrder()');
  });

  it('flags a join found through a method call on a locally-constructed instance', () => {
    const source = parseSource(`
      class OrderMatcher {
        match(user) {
          for (const order of orders) {
            if (user.id === order.userId) {
              console.log(order);
            }
          }
        }
      }

      function run() {
        const matcher = new OrderMatcher();
        for (const user of users) {
          matcher.match(user);
        }
      }
    `);

    const finding = checkOuterLoop(source);
    expect(finding?.message).toContain('via OrderMatcher.match()');
  });

  it('follows a chain across two hops', () => {
    const source = parseSource(`
      function innerMatch(user) {
        for (const order of orders) {
          if (user.id === order.userId) {
            console.log(order);
          }
        }
      }

      function outerMatch(user) {
        innerMatch(user);
      }

      function run() {
        for (const user of users) {
          outerMatch(user);
        }
      }
    `);

    const finding = checkOuterLoop(source);
    expect(finding?.tip).toContain('inner loop at');
    expect(finding?.message).toContain('via outerMatch() → innerMatch()');
  });

  it('flags a join between an outer canonical for loop and an indexed inner loop reached via a call', () => {
    const source = parseSource(`
      function matchOrder(user) {
        for (let j = 0; j < orders.length; j++) {
          if (user.id === orders[j].userId) {
            console.log(orders[j]);
          }
        }
      }

      function run() {
        for (let i = 0; i < users.length; i++) {
          matchOrder(users[i]);
        }
      }
    `);

    expect(checkOuterLoop(source)).not.toBeNull();
  });

  it('resolves a forwarded callback passed to .forEach()', () => {
    const source = parseSource(`
      class Service {
        run() {
          for (const user of users) {
            user.orders.forEach(this.matchOrder);
          }
        }

        matchOrder(order) {
          for (const candidate of candidates) {
            if (order.id === candidate.orderId) {
              console.log(candidate);
            }
          }
        }
      }
    `);

    const finding = checkOuterLoop(source);
    expect(finding?.message).toContain('via Service.matchOrder()');
  });

  it('does not flag when no call site is reachable', () => {
    const source = parseSource('for (const user of users) { console.log(user); }');
    expect(checkOuterLoop(source)).toBeNull();
  });

  it('does not flag when the call target cannot be resolved', () => {
    const source = parseSource(`
      function run(handlers) {
        for (const user of users) {
          handlers[user.type](user);
        }
      }
    `);
    expect(checkOuterLoop(source)).toBeNull();
  });

  it('bails out on a spread argument at the call site', () => {
    const source = parseSource(`
      function matchOrder(user) {
        for (const order of orders) {
          if (user.id === order.userId) {
            console.log(order);
          }
        }
      }

      function run(...args) {
        for (const user of users) {
          matchOrder(...args, user);
        }
      }
    `);
    expect(checkOuterLoop(source)).toBeNull();
  });

  it('suppresses when the inner collection is fixed-size', () => {
    const source = parseSource(`
      function matchOrder(user) {
        for (const order of ['a', 'b']) {
          if (user.id === order.userId) {
            console.log(order);
          }
        }
      }

      function run() {
        for (const user of users) {
          matchOrder(user);
        }
      }
    `);
    expect(checkOuterLoop(source)).toBeNull();
  });
});

describe('interproceduralLoopJoinRule message, cross-file, and bounds', () => {
  const innerLoop = `
        for (const order of orders) {
          if (user.id === order.userId) {
            console.log(order);
          }
        }`;

  function chainSource(hops: number): string {
    const fns: string[] = [`function hop${hops}(user) {${innerLoop}\n      }`];
    for (let i = hops - 1; i >= 1; i--) fns.push(`function hop${i}(user) { hop${i + 1}(user); }`);
    fns.push('function run() { for (const user of users) { hop1(user); } }');
    return fns.join('\n');
  }

  it('produces the exact message and tip, naming the inner loop file and line', () => {
    const helper = parseSource(
      `export function matchOrder(user) {${innerLoop}
      }`,
      '/virtual/helper.ts'
    );
    const source = parseSource(
      `
      import { matchOrder } from './helper.js';
      function run() {
        for (const user of users) {
          matchOrder(user);
        }
      }
      `,
      '/virtual/run.ts'
    );

    const finding = checkOuterLoop(source, [helper]);

    expect(finding?.message).toBe(
      'Potential O(n × m) algorithm: every item is compared against every orders using id vs userId, via matchOrder(). ' +
        'Estimated complexity: O(users × orders).'
    );
    expect(finding?.tip).toBe(
      'Index orders by userId before the loop, then look up matches instead of scanning (inner loop at /virtual/helper.ts:2). ' +
        'Possible complexity after optimization: O(users + orders).'
    );
  });

  it('follows a chain of exactly 20 hops', () => {
    expect(checkOuterLoop(parseSource(chainSource(20)))).not.toBeNull();
  });

  it('stops after 20 hops', () => {
    expect(checkOuterLoop(parseSource(chainSource(21)))).toBeNull();
  });

  it('terminates on recursion without a finding', () => {
    const source = parseSource(`
      function recurse(user) { recurse(user); }
      function run() { for (const user of users) { recurse(user); } }
    `);
    expect(checkOuterLoop(source)).toBeNull();
  });
});

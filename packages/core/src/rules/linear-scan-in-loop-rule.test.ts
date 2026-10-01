// packages/core/src/rules/linear-scan-in-loop-rule.test.ts
import { describe, it, expect } from 'vitest';
import { collectLoops } from '../ast/loop-collector.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import { buildProjectIndex } from '../project/project-index-builder.js';
import { linearScanInLoopRule } from './linear-scan-in-loop-rule.js';
import { parseSource } from '../test-support/parse-source.js';
import type { AnalysisContext } from './loop-rule.js';

function checkFirstLoop(source: string) {
  const sourceFile = parseSource(source);
  const projectIndex = buildProjectIndex(new Map([[sourceFile.fileName, sourceFile]]));
  const ctx: AnalysisContext = { sourceFile, projectIndex };
  const loop = collectLoops(sourceFile)[0];
  return linearScanInLoopRule.check(loop, findPrecedingStatements(loop.node), ctx);
}

describe('linearScanInLoopRule', () => {
  it('flags .includes() scanning an unrelated collection for the loop item', () => {
    const finding = checkFirstLoop(`
      for (const user of users) {
        if (blockedIds.includes(user.id)) {
          console.log(user);
        }
      }
    `);
    expect(finding?.message).toBe(
      'Potential O(n × m) algorithm: every user is checked against blockedIds using includes(). Estimated complexity: O(users × blockedIds).'
    );
    expect(finding?.tip).toBe(
      'Convert blockedIds to a Set/Map before the loop, then use .has()/.get() instead of includes(). Possible complexity after optimization: O(users + blockedIds).'
    );
  });

  it('flags .indexOf() combined with && at any depth (used truthily, matching PHP big0nia\'s own array_search convention)', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          if (user.active && blockedIds.indexOf(user.id)) {
            console.log(user);
          }
        }
      `)
    ).not.toBeNull();
  });

  it('flags .find() whose predicate compares against the loop item', () => {
    const finding = checkFirstLoop(`
      for (const user of users) {
        if (blockedUsers.find((b) => b.id === user.id)) {
          console.log(user);
        }
      }
    `);
    expect(finding?.message).toContain('using find()');
  });

  it('flags a canonical indexed for loop using the collection[index] label', () => {
    const finding = checkFirstLoop(`
      for (let i = 0; i < users.length; i++) {
        if (blockedIds.includes(users[i].id)) {
          console.log(users[i]);
        }
      }
    `);
    expect(finding?.message).toContain('every users[i] is checked against blockedIds');
  });

  it('flags a scan negated with unary !', () => {
    const finding = checkFirstLoop(`
      for (const user of users) {
        if (!blockedIds.includes(user.id)) {
          console.log(user);
        }
      }
    `);
    expect(finding?.ruleId).toBe('linear-scan-in-loop');
  });

  it('does not flag a scan of the loop\'s own collection', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          if (users.includes(user.manager)) {
            console.log(user);
          }
        }
      `)
    ).toBeNull();
  });

  it('does not flag when the needle is unrelated to the loop item', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          if (blockedIds.includes(otherId)) {
            console.log(user);
          }
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the haystack is a fixed-size array literal', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          if (['a', 'b'].includes(user.id)) {
            console.log(user);
          }
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the loop bounds to one pass', () => {
    expect(
      checkFirstLoop(`
        for (const user of users) {
          if (blockedIds.includes(user.id)) {
            console.log(user);
          }
          break;
        }
      `)
    ).toBeNull();
  });
});

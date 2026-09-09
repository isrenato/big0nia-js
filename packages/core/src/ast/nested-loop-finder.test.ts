// packages/core/src/ast/nested-loop-finder.test.ts
import { describe, it, expect } from 'vitest';
import { collectLoops } from './loop-collector.js';
import { findDirectNestedLoop } from './nested-loop-finder.js';
import { parseSource } from '../test-support/parse-source.js';

describe('findDirectNestedLoop', () => {
  it('finds a for-of nested directly in a for-of body', () => {
    const source = parseSource(`
      for (const user of users) {
        for (const order of orders) {
          console.log(user, order);
        }
      }
    `);
    const [outer] = collectLoops(source);
    const inner = findDirectNestedLoop(outer);
    expect(inner?.kind).toBe('forOf');
    expect(inner?.itemName).toBe('order');
  });

  it('finds a .forEach() nested inside a for-of through an if guard', () => {
    const source = parseSource(`
      for (const user of users) {
        if (user.active) {
          orders.forEach((order) => {
            console.log(user, order);
          });
        }
      }
    `);
    const [outer] = collectLoops(source);
    const inner = findDirectNestedLoop(outer);
    expect(inner?.kind).toBe('forEach');
  });

  it('does not find a loop only reachable through an else branch', () => {
    const source = parseSource(`
      for (const user of users) {
        if (user.active) {
          console.log(user);
        } else {
          for (const order of orders) {
            console.log(order);
          }
        }
      }
    `);
    const [outer] = collectLoops(source);
    expect(findDirectNestedLoop(outer)).toBeNull();
  });

  it('returns null when there is no nested loop', () => {
    const source = parseSource(`
      for (const user of users) {
        console.log(user);
      }
    `);
    const [outer] = collectLoops(source);
    expect(findDirectNestedLoop(outer)).toBeNull();
  });

  it('does not descend into an unrelated nested closure', () => {
    const source = parseSource(`
      for (const user of users) {
        const handler = function () {
          for (const order of orders) {
            console.log(order);
          }
        };
      }
    `);
    const [outer] = collectLoops(source);
    expect(findDirectNestedLoop(outer)).toBeNull();
  });
});

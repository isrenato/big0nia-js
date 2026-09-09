import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { collectLoops } from './loop-collector.js';
import { parseSource } from '../test-support/parse-source.js';

describe('collectLoops', () => {
  it('collects a canonical indexed for-loop', () => {
    const source = parseSource(`
      for (let i = 0; i < items.length; i++) {
        console.log(items[i]);
      }
    `);
    const loops = collectLoops(source);
    expect(loops).toHaveLength(1);
    expect(loops[0].kind).toBe('for');
    expect(loops[0].indexName).toBe('i');
    expect(loops[0].collectionExpr && ts.isIdentifier(loops[0].collectionExpr) && loops[0].collectionExpr.text).toBe('items');
  });

  it('does not collect a non-canonical for-loop (<=)', () => {
    const source = parseSource(`
      for (let i = 0; i <= items.length; i++) {
        console.log(items[i]);
      }
    `);
    expect(collectLoops(source)).toHaveLength(0);
  });

  it('does not collect a for-loop with a decrementing index', () => {
    const source = parseSource(`
      for (let i = 0; i < items.length; i--) {
        console.log(items[i]);
      }
    `);
    expect(collectLoops(source)).toHaveLength(0);
  });

  it('collects a for-of loop with its item name', () => {
    const source = parseSource(`
      for (const user of users) {
        console.log(user);
      }
    `);
    const loops = collectLoops(source);
    expect(loops).toHaveLength(1);
    expect(loops[0].kind).toBe('forOf');
    expect(loops[0].itemName).toBe('user');
  });

  it('collects a destructured for-of loop with a null item name', () => {
    const source = parseSource(`
      for (const [key, value] of entries) {
        console.log(key, value);
      }
    `);
    const loops = collectLoops(source);
    expect(loops).toHaveLength(1);
    expect(loops[0].itemName).toBeNull();
  });

  it('collects a .forEach() call with item and index params', () => {
    const source = parseSource(`
      users.forEach((user, index) => {
        console.log(user, index);
      });
    `);
    const loops = collectLoops(source);
    expect(loops).toHaveLength(1);
    expect(loops[0].kind).toBe('forEach');
    expect(loops[0].itemName).toBe('user');
    expect(loops[0].indexName).toBe('index');
  });

  it('collects a .map() call the same way as .forEach()', () => {
    const source = parseSource(`items.map((item) => { process(item); });`);
    const loops = collectLoops(source);
    expect(loops).toHaveLength(1);
    expect(loops[0].kind).toBe('forEach');
  });

  it('does not collect an unrelated method call', () => {
    const source = parseSource(`items.filter((item) => item.active);`);
    expect(collectLoops(source)).toHaveLength(0);
  });

  it('does not collect a .forEach() call with no inline callback', () => {
    const source = parseSource(`items.forEach(handler);`);
    expect(collectLoops(source)).toHaveLength(0);
  });

  it('collects both loops in a directly nested pair, without duplicates', () => {
    const source = parseSource(`
      for (const user of users) {
        for (const order of orders) {
          console.log(user, order);
        }
      }
    `);
    expect(collectLoops(source)).toHaveLength(2);
  });
});

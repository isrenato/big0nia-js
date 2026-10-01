// packages/core/src/rules/repeated-sort-in-loop-rule.test.ts
import { describe, it, expect } from 'vitest';
import { collectLoops } from '../ast/loop-collector.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import { buildProjectIndex } from '../project/project-index-builder.js';
import { repeatedSortInLoopRule } from './repeated-sort-in-loop-rule.js';
import { parseSource } from '../test-support/parse-source.js';
import type { AnalysisContext } from './loop-rule.js';

function checkFirstLoop(source: string) {
  const sourceFile = parseSource(source);
  const projectIndex = buildProjectIndex(new Map([[sourceFile.fileName, sourceFile]]));
  const ctx: AnalysisContext = { sourceFile, projectIndex };
  const loop = collectLoops(sourceFile)[0];
  return repeatedSortInLoopRule.check(loop, findPrecedingStatements(loop.node), ctx);
}

describe('repeatedSortInLoopRule', () => {
  it('flags a repeated sort of an unmodified array', () => {
    const finding = checkFirstLoop(`
      for (const item of items) {
        items.sort((a, b) => a.value - b.value);
        console.log(item);
      }
    `);
    expect(finding?.message).toBe(
      'Potential wasted work: items.sort(...) re-sorts items on every iteration, but items is never modified inside this loop.'
    );
    expect(finding?.tip).toBe(
      'Move items.sort(...) above the loop — sorting an already-sorted, unchanged array repeatedly wastes work per iteration for no benefit.'
    );
  });

  it('flags a comparator-less sort call too', () => {
    expect(
      checkFirstLoop(`
        for (const item of items) {
          items.sort();
          console.log(item);
        }
      `)
    ).not.toBeNull();
  });

  it('finds the sort call through an else-if chain', () => {
    const finding = checkFirstLoop(`
      for (const item of items) {
        if (item.skip) {
          continue;
        } else if (item.sortFirst) {
          items.sort();
        }
      }
    `);
    expect(finding).not.toBeNull();
  });

  it('does not flag when the array is reassigned inside the loop', () => {
    expect(
      checkFirstLoop(`
        for (const item of items) {
          items.sort();
          items = items.filter((x) => x.active);
        }
      `)
    ).toBeNull();
  });

  it('does not flag when the array is mutated inside a nested loop', () => {
    expect(
      checkFirstLoop(`
        for (const item of items) {
          items.sort();
          for (const other of others) {
            items.push(other);
          }
        }
      `)
    ).toBeNull();
  });

  it('does not flag when an element is updated in place', () => {
    expect(
      checkFirstLoop(`
        for (const item of items) {
          scores.sort();
          scores[0]++;
        }
      `)
    ).toBeNull();
  });

  it('suppresses when the loop iterates a fixed-size array literal', () => {
    expect(
      checkFirstLoop(`
        for (const item of ['a', 'b']) {
          items.sort();
        }
      `)
    ).toBeNull();
  });

  it('does not flag when there is no sort call', () => {
    expect(checkFirstLoop('for (const item of items) { console.log(item); }')).toBeNull();
  });
});

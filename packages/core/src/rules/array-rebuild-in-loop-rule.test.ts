// packages/core/src/rules/array-rebuild-in-loop-rule.test.ts
import { describe, it, expect } from 'vitest';
import { collectLoops } from '../ast/loop-collector.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import { buildProjectIndex } from '../project/project-index-builder.js';
import { arrayRebuildInLoopRule } from './array-rebuild-in-loop-rule.js';
import { parseSource } from '../test-support/parse-source.js';
import type { AnalysisContext } from './loop-rule.js';

function checkFirstLoop(source: string) {
  const sourceFile = parseSource(source);
  const projectIndex = buildProjectIndex(new Map([[sourceFile.fileName, sourceFile]]));
  const ctx: AnalysisContext = { sourceFile, projectIndex };
  const loop = collectLoops(sourceFile)[0];
  return arrayRebuildInLoopRule.check(loop, findPrecedingStatements(loop.node), ctx);
}

describe('arrayRebuildInLoopRule', () => {
  it('flags a self-referential concat rebuild', () => {
    const finding = checkFirstLoop(`
      for (const item of items) {
        result = result.concat([item]);
      }
    `);
    expect(finding?.message).toBe('Potential O(n²) algorithm: result.concat(...) rebuilds result from scratch on every iteration.');
    expect(finding?.tip).toBe(
      'Replace result.concat(...) with result.push(...) (or an equivalent append), or build the pieces separately and concatenate once after the loop.'
    );
  });

  it('flags a self-referential spread rebuild', () => {
    const finding = checkFirstLoop(`
      for (const item of items) {
        result = [...result, item];
      }
    `);
    expect(finding?.message).toBe('Potential O(n²) algorithm: [...result, ...] rebuilds result from scratch on every iteration.');
  });

  it('flags a concat that re-includes its target as an argument', () => {
    const finding = checkFirstLoop(`
      for (const item of items) {
        result = prefix.concat(result, [item]);
      }
    `);
    expect(finding?.message).toBe('Potential O(n²) algorithm: result.concat(...) rebuilds result from scratch on every iteration.');
  });

  it('does not flag a concat that does not include its own target', () => {
    expect(
      checkFirstLoop(`
        for (const item of items) {
          result = other.concat([item]);
        }
      `)
    ).toBeNull();
  });

  it('finds the rebuild through an else branch', () => {
    const finding = checkFirstLoop(`
      for (const item of items) {
        if (item.active) {
          console.log(item);
        } else {
          result = result.concat([item]);
        }
      }
    `);
    expect(finding).not.toBeNull();
  });

  it('suppresses when the loop iterates a fixed-size array literal', () => {
    expect(
      checkFirstLoop(`
        for (const item of ['a', 'b']) {
          result = result.concat([item]);
        }
      `)
    ).toBeNull();
  });

  it('does not flag when there is no self-rebuild', () => {
    expect(checkFirstLoop('for (const item of items) { result.push(item); }')).toBeNull();
  });
});

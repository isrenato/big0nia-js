// packages/core/src/analysis/file-analyser.test.ts
import { describe, it, expect } from 'vitest';
import { analyseFile } from './file-analyser.js';
import { buildProjectIndex } from '../project/project-index-builder.js';
import { parseSource } from '../test-support/parse-source.js';
import type { LoopRule } from '../rules/loop-rule.js';

function fakeRule(id: string, matchesKind: string): LoopRule {
  return {
    id,
    check(loop) {
      return loop.kind === matchesKind ? { ruleId: id, line: 1, message: `${id} matched`, tip: 'tip' } : null;
    },
  };
}

describe('analyseFile', () => {
  it('runs every rule against every loop and stamps the file path', () => {
    const source = parseSource(
      `
      for (const user of users) { console.log(user); }
      for (let i = 0; i < items.length; i++) { console.log(items[i]); }
      `,
      '/virtual/example.ts'
    );
    const projectIndex = buildProjectIndex(new Map([[source.fileName, source]]));

    const diagnostics = analyseFile(source, [fakeRule('forof-rule', 'forOf'), fakeRule('for-rule', 'for')], projectIndex);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((d) => d.file === '/virtual/example.ts')).toBe(true);
    expect(diagnostics.map((d) => d.ruleId).sort()).toEqual(['for-rule', 'forof-rule']);
  });

  it('returns an empty array when no rule matches', () => {
    const source = parseSource('for (const user of users) { console.log(user); }', '/virtual/example.ts');
    const projectIndex = buildProjectIndex(new Map([[source.fileName, source]]));

    expect(analyseFile(source, [fakeRule('never', 'forEach')], projectIndex)).toEqual([]);
  });

  it('returns an empty array when the file has no loops', () => {
    const source = parseSource('const x = 1;', '/virtual/example.ts');
    const projectIndex = buildProjectIndex(new Map([[source.fileName, source]]));

    expect(analyseFile(source, [fakeRule('never', 'forOf')], projectIndex)).toEqual([]);
  });
});

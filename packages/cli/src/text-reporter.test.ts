import { describe, it, expect } from 'vitest';
import type { Diagnostic } from '@big0nia/core';
import { formatText } from './text-reporter.js';

const diagnostic = (file: string, line: number): Diagnostic => ({
  file,
  line,
  ruleId: 'nested-loop-join',
  message: 'Potential O(n × m) algorithm: something.',
  tip: 'Index it.',
});

describe('formatText', () => {
  it('prints "No issues found." when there are no diagnostics', () => {
    expect(formatText([])).toBe('No issues found.\n');
  });

  it('prints each finding as a block followed by the issue count', () => {
    expect(formatText([diagnostic('src/a.ts', 2), diagnostic('src/b.ts', 7)])).toBe(
      'src/a.ts:2\n' +
        '  Potential O(n × m) algorithm: something.\n' +
        '  Tip: Index it.\n' +
        '\n' +
        'src/b.ts:7\n' +
        '  Potential O(n × m) algorithm: something.\n' +
        '  Tip: Index it.\n' +
        '\n' +
        '2 issue(s) found.\n'
    );
  });
});

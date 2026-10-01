import { describe, it, expect } from 'vitest';
import { formatJson } from './json-reporter.js';

describe('formatJson', () => {
  it('prints an empty array when there are no diagnostics', () => {
    expect(formatJson([])).toBe('[]\n');
  });

  it('prints each diagnostic with file, line, ruleId, message, and tip', () => {
    const output = formatJson([
      { file: 'src/a.ts', line: 2, ruleId: 'linear-scan-in-loop', message: 'msg', tip: 'tip' },
    ]);
    expect(JSON.parse(output)).toEqual([{ file: 'src/a.ts', line: 2, ruleId: 'linear-scan-in-loop', message: 'msg', tip: 'tip' }]);
  });
});

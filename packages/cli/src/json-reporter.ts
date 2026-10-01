import type { Diagnostic } from '@big0nia/core';

export function formatJson(diagnostics: Diagnostic[]): string {
  const rows = diagnostics.map(({ file, line, ruleId, message, tip }) => ({ file, line, ruleId, message, tip }));
  return `${JSON.stringify(rows, null, 2)}\n`;
}

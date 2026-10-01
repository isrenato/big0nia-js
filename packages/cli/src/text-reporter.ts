import type { Diagnostic } from '@big0nia/core';

export function formatText(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return 'No issues found.\n';

  const blocks = diagnostics.map((d) => `${d.file}:${d.line}\n  ${d.message}\n  Tip: ${d.tip}\n\n`);
  return `${blocks.join('')}${diagnostics.length} issue(s) found.\n`;
}

import { describe, it, expect } from 'vitest';
import { parseForESLint } from '@typescript-eslint/parser';
import { analyseFile, buildProjectIndex, nestedLoopJoinRule } from '@big0nia/core';
import { toSourceFile } from './source-file.js';

const SOURCE = `for (const user of users) {
  for (const order of orders) {
    if (user.id === order.userId) {
      console.log(order);
    }
  }
}
`;

function findings(sourceFile: ReturnType<typeof toSourceFile>) {
  return analyseFile(sourceFile, [nestedLoopJoinRule], buildProjectIndex(new Map([[sourceFile.fileName, sourceFile]])));
}

describe('toSourceFile', () => {
  it('reuses the TypeScript SourceFile from typescript-eslint node maps', () => {
    const { ast, services } = parseForESLint(SOURCE, { filePath: '/virtual/example.ts' });
    const sourceFile = toSourceFile({ ast, text: SOURCE, parserServices: services }, '/virtual/example.ts');
    expect(sourceFile).toBe(services.esTreeNodeToTSNodeMap.get(ast));
  });

  it('falls back to parsing the text itself when node maps are absent', () => {
    const sourceFile = toSourceFile({ ast: {}, text: SOURCE, parserServices: {} }, '/virtual/example.js');
    expect(sourceFile.fileName).toBe('/virtual/example.js');
    expect(sourceFile.statements).toHaveLength(1);
  });

  it('produces identical findings from the bridged and fallback source files', () => {
    const { ast, services } = parseForESLint(SOURCE, { filePath: '/virtual/example.ts' });
    const bridged = toSourceFile({ ast, text: SOURCE, parserServices: services }, '/virtual/example.ts');
    const fallback = toSourceFile({ ast, text: SOURCE, parserServices: undefined }, '/virtual/example.ts');

    expect(findings(bridged)).toHaveLength(1);
    expect(findings(fallback)).toEqual(findings(bridged));
  });
});

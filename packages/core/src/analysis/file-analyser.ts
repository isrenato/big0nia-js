// packages/core/src/analysis/file-analyser.ts
import type * as ts from 'typescript';
import { collectLoops } from '../ast/loop-collector.js';
import { findPrecedingStatements } from '../ast/preceding-statements.js';
import type { LoopRule } from '../rules/loop-rule.js';
import type { ProjectIndex } from '../project/project-index.js';
import type { Diagnostic } from './diagnostic.js';

export function analyseFile(sourceFile: ts.SourceFile, rules: LoopRule[], projectIndex: ProjectIndex): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const ctx = { sourceFile, projectIndex };

  for (const loop of collectLoops(sourceFile)) {
    const precedingStmts = findPrecedingStatements(loop.node);

    for (const rule of rules) {
      const finding = rule.check(loop, precedingStmts, ctx);
      if (finding) diagnostics.push({ ...finding, file: sourceFile.fileName });
    }
  }

  return diagnostics;
}

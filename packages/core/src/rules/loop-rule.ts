// packages/core/src/rules/loop-rule.ts
import type * as ts from 'typescript';
import type { LoopLike } from '../ast/loop-like.js';
import type { ProjectIndex } from '../project/project-index.js';

export interface Finding {
  ruleId: string;
  line: number;
  message: string;
  tip: string;
}

export interface AnalysisContext {
  sourceFile: ts.SourceFile;
  projectIndex: ProjectIndex;
}

export interface LoopRule {
  readonly id: string;
  check(loop: LoopLike, precedingStmts: ts.Statement[], ctx: AnalysisContext): Finding | null;
}

export function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

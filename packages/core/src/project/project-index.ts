// packages/core/src/project/project-index.ts
import type * as ts from 'typescript';

export interface FunctionEntry {
  node: ts.FunctionDeclaration;
  filePath: string;
}

export interface ClassEntry {
  name: string;
  node: ts.ClassDeclaration;
  filePath: string;
}

export interface ProjectIndex {
  /** Top-level classes, keyed by file path then by simple class name. */
  classesByFile: Map<string, Map<string, ClassEntry>>;
  /** Top-level function declarations, keyed by file path then by simple function name. */
  functionsByFile: Map<string, Map<string, FunctionEntry>>;
  /** Simple interface name -> every class across all analyzed files whose `implements` clause names it directly. */
  interfaceImplementors: Map<string, ClassEntry[]>;
  /** Every analyzed file's parsed SourceFile, for relative-import resolution. */
  sourceFilesByPath: Map<string, ts.SourceFile>;
}

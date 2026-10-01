import * as ts from 'typescript';

/** The parts of ESLint's `SourceCode` the bridge needs. */
export interface SourceCodeLike {
  ast: unknown;
  text: string;
  parserServices?: { esTreeNodeToTSNodeMap?: { get(node: unknown): unknown } };
}

/**
 * Returns the TypeScript `SourceFile` for the file being linted. Under `@typescript-eslint/parser` this is the
 * parser's own SourceFile (parent pointers set); with any other parser, the text is parsed here instead.
 */
export function toSourceFile(sourceCode: SourceCodeLike, filename: string): ts.SourceFile {
  const mapped = sourceCode.parserServices?.esTreeNodeToTSNodeMap?.get(sourceCode.ast);
  if (mapped && ts.isSourceFile(mapped as ts.Node)) return mapped as ts.SourceFile;

  return ts.createSourceFile(filename, sourceCode.text, ts.ScriptTarget.ES2022, true);
}

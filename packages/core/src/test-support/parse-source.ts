import * as ts from 'typescript';

export function parseSource(source: string, fileName = 'test.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

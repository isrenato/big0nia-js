import * as fs from 'node:fs';
import * as ts from 'typescript';
import { buildProjectIndex, relativeImportCandidates, type ProjectIndex } from '@big0nia/core';

interface CachedFile {
  mtimeMs: number;
  sourceFile: ts.SourceFile | null;
}

/** Imported files parsed during this lint process, keyed by path; an entry is reused while its mtime is unchanged. */
const cache = new Map<string, CachedFile>();

type ParsedSourceFile = ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };

function loadFromDisk(filePath: string): ts.SourceFile | null {
  let mtimeMs: number;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    mtimeMs = stat.mtimeMs;
  } catch {
    return null;
  }

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.sourceFile;

  let sourceFile: ParsedSourceFile | null;
  try {
    sourceFile = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2022, true);
    if (sourceFile.parseDiagnostics?.length) sourceFile = null;
  } catch {
    sourceFile = null;
  }

  cache.set(filePath, { mtimeMs, sourceFile });
  return sourceFile;
}

function relativeSpecifiers(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((stmt) => stmt.moduleSpecifier)
    .filter((specifier): specifier is ts.StringLiteral => ts.isStringLiteral(specifier) && specifier.text.startsWith('.'))
    .map((specifier) => specifier.text);
}

/**
 * Builds a project index from the linted file plus every file reachable from it through relative imports,
 * read from disk. ESLint lints one file at a time, so this is the plugin's deterministic stand-in for the
 * CLI's whole-run index. Unreadable or unparsable files are left out (their calls stay unresolved).
 */
export function buildImportGraphIndex(entry: ts.SourceFile): ProjectIndex {
  const files = new Map<string, ts.SourceFile>([[entry.fileName, entry]]);
  const queue = [entry];

  for (let current = queue.shift(); current; current = queue.shift()) {
    for (const specifier of relativeSpecifiers(current)) {
      for (const candidate of relativeImportCandidates(current.fileName, specifier)) {
        if (files.has(candidate)) break;

        const imported = loadFromDisk(candidate);
        if (!imported) continue;

        files.set(candidate, imported);
        queue.push(imported);
        break;
      }
    }
  }

  return buildProjectIndex(files);
}

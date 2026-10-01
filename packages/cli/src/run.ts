import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import * as ts from 'typescript';
import {
  ConfigError,
  analyseFile,
  arrayRebuildInLoopRule,
  buildProjectIndex,
  interproceduralLoopJoinRule,
  linearScanInLoopRule,
  loadConfig,
  nestedLoopJoinRule,
  repeatedSortInLoopRule,
  type Diagnostic,
  type LoopRule,
} from '@big0nia/core';
import { collectFiles } from './file-collector.js';
import { formatJson } from './json-reporter.js';
import { formatText } from './text-reporter.js';

export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const USAGE = 'Usage: big0nia analyse [--json] <path...>\n';

const RULES: LoopRule[] = [
  nestedLoopJoinRule,
  interproceduralLoopJoinRule,
  arrayRebuildInLoopRule,
  linearScanInLoopRule,
  repeatedSortInLoopRule,
];

/** `parseDiagnostics` is populated by the parser but not declared in TypeScript's public typings. */
type ParsedSourceFile = ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] };

function parseCommand(argv: string[]): { json: boolean; paths: string[] } | null {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: { json: { type: 'boolean', default: false } }, allowPositionals: true });
  } catch {
    return null;
  }

  const [command, ...paths] = parsed.positionals;
  if (command !== 'analyse' || paths.length === 0) return null;

  return { json: parsed.values.json ?? false, paths };
}

function displayPath(cwd: string, absolutePath: string): string {
  const relative = path.relative(cwd, absolutePath);
  const outside = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  return outside ? absolutePath : relative.split(path.sep).join('/');
}

function firstParseError(sourceFile: ParsedSourceFile): string | null {
  const diagnostic = sourceFile.parseDiagnostics?.[0];
  return diagnostic ? ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') : null;
}

export async function run(argv: string[], io: CliIo): Promise<number> {
  const command = parseCommand(argv);
  if (!command) {
    io.stderr(USAGE);
    return 1;
  }

  let ignorePaths: string[];
  try {
    ignorePaths = loadConfig(io.cwd).ignorePaths;
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    io.stderr(`${error.message}\n`);
    return 1;
  }

  const { files, missingPaths } = collectFiles(command.paths, io.cwd, ignorePaths);
  let failed = missingPaths.length > 0;
  for (const missing of missingPaths) io.stderr(`Path not found: ${missing}\n`);

  const sourceFiles = new Map<string, ts.SourceFile>();
  for (const file of files) {
    // Files are parsed under their display path so every path in the output (including the inner-loop
    // location in interprocedural tips) is cwd-relative.
    const shownPath = displayPath(io.cwd, file);
    let sourceFile: ParsedSourceFile;
    try {
      sourceFile = ts.createSourceFile(shownPath, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    } catch (error) {
      io.stderr(`Skipping ${shownPath}: ${(error as Error).message}\n`);
      failed = true;
      continue;
    }

    const parseError = firstParseError(sourceFile);
    if (parseError) {
      io.stderr(`Skipping ${shownPath}: ${parseError}\n`);
      failed = true;
      continue;
    }

    sourceFiles.set(shownPath, sourceFile);
  }

  const projectIndex = buildProjectIndex(sourceFiles);
  const diagnostics: Diagnostic[] = [];
  for (const sourceFile of sourceFiles.values()) {
    diagnostics.push(...analyseFile(sourceFile, RULES, projectIndex));
  }

  diagnostics.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  io.stdout(command.json ? formatJson(diagnostics) : formatText(diagnostics));

  return failed || diagnostics.length > 0 ? 1 : 0;
}

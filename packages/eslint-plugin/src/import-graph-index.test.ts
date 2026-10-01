import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import { buildImportGraphIndex } from './import-graph-index.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'big0nia-graph-')));
  tempDirs.push(dir);
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), contents);
  }
  return dir;
}

function entry(dir: string, name: string): ts.SourceFile {
  const filePath = path.join(dir, name);
  return ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2022, true);
}

function indexedFiles(dir: string, sourceFile: ts.SourceFile): string[] {
  return [...buildImportGraphIndex(sourceFile).sourceFilesByPath.keys()].map((f) => path.relative(dir, f)).sort();
}

describe('buildImportGraphIndex', () => {
  it('indexes the linted file plus its transitive relative imports only', () => {
    const dir = project({
      'src/run.ts': "import { a } from './a.js';\nimport { x } from 'some-package';\n",
      'src/a.ts': "import { b } from './lib';\nexport function a() {}\n",
      'src/lib/index.js': 'export function b() {}\n',
      'src/unrelated.ts': 'export function c() {}\n',
    });
    expect(indexedFiles(dir, entry(dir, 'src/run.ts'))).toEqual(['src/a.ts', 'src/lib/index.js', 'src/run.ts']);
  });

  it('indexes functions found in imported files', () => {
    const dir = project({ 'run.ts': "import { a } from './a';\n", 'a.ts': 'export function a() {}\n' });
    const index = buildImportGraphIndex(entry(dir, 'run.ts'));
    expect(index.functionsByFile.get(path.join(dir, 'a.ts'))?.get('a')).toBeDefined();
  });

  it('ignores a relative import whose target does not exist', () => {
    const dir = project({ 'run.ts': "import { a } from './missing.js';\n" });
    expect(indexedFiles(dir, entry(dir, 'run.ts'))).toEqual(['run.ts']);
  });

  it('skips an imported file that does not parse', () => {
    const dir = project({ 'run.ts': "import { a } from './broken';\n", 'broken.ts': 'for (const x of {' });
    expect(indexedFiles(dir, entry(dir, 'run.ts'))).toEqual(['run.ts']);
  });

  it('terminates on import cycles', () => {
    const dir = project({ 'a.ts': "import { b } from './b';\n", 'b.ts': "import { a } from './a';\n" });
    expect(indexedFiles(dir, entry(dir, 'a.ts'))).toEqual(['a.ts', 'b.ts']);
  });

  it('re-reads an imported file after its mtime changes', () => {
    const dir = project({ 'run.ts': "import { a } from './a';\n", 'a.ts': 'export function a() {}\n' });
    const imported = path.join(dir, 'a.ts');
    expect(buildImportGraphIndex(entry(dir, 'run.ts')).functionsByFile.get(imported)?.has('a')).toBe(true);

    fs.writeFileSync(imported, 'export function renamed() {}\n');
    const later = new Date(Date.now() + 10_000);
    fs.utimesSync(imported, later, later);

    const index = buildImportGraphIndex(entry(dir, 'run.ts'));
    expect(index.functionsByFile.get(imported)?.has('a')).toBe(false);
    expect(index.functionsByFile.get(imported)?.has('renamed')).toBe(true);
  });
});

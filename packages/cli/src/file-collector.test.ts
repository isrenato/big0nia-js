import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { collectFiles } from './file-collector.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function tempTree(files: string[]): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'big0nia-collect-')));
  tempDirs.push(dir);
  for (const file of files) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), '');
  }
  return dir;
}

function relative(dir: string, files: string[]): string[] {
  return files.map((f) => path.relative(dir, f));
}

describe('collectFiles', () => {
  it('collects the four source extensions recursively, in sorted order', () => {
    const dir = tempTree(['src/b.ts', 'src/a.tsx', 'src/nested/c.js', 'src/nested/d.jsx', 'src/readme.md', 'src/data.json']);
    const result = collectFiles(['src'], dir, []);
    expect(relative(dir, result.files)).toEqual(['src/a.tsx', 'src/b.ts', 'src/nested/c.js', 'src/nested/d.jsx']);
    expect(result.missingPaths).toEqual([]);
  });

  it('skips node_modules directories', () => {
    const dir = tempTree(['src/a.ts', 'src/node_modules/pkg/index.js', 'node_modules/other/index.ts']);
    expect(relative(dir, collectFiles(['.'], dir, []).files)).toEqual(['src/a.ts']);
  });

  it('accepts an explicitly named source file', () => {
    const dir = tempTree(['src/a.ts', 'src/b.ts']);
    expect(relative(dir, collectFiles(['src/b.ts'], dir, []).files)).toEqual(['src/b.ts']);
  });

  it('ignores an explicitly named non-source file', () => {
    const dir = tempTree(['notes.md']);
    expect(collectFiles(['notes.md'], dir, []).files).toEqual([]);
  });

  it('reports missing paths separately and keeps collecting the rest', () => {
    const dir = tempTree(['src/a.ts']);
    const result = collectFiles(['nope', 'src'], dir, []);
    expect(result.missingPaths).toEqual(['nope']);
    expect(relative(dir, result.files)).toEqual(['src/a.ts']);
  });

  it('does not collect the same file twice when paths overlap', () => {
    const dir = tempTree(['src/a.ts']);
    expect(relative(dir, collectFiles(['src', 'src/a.ts'], dir, []).files)).toEqual(['src/a.ts']);
  });
});

describe('collectFiles with ignorePaths', () => {
  it('excludes files whose cwd-relative path contains an entry as a substring', () => {
    const dir = tempTree(['src/a.ts', 'dist/a.js', 'src/dist-copy/b.ts']);
    expect(relative(dir, collectFiles(['.'], dir, ['dist']).files)).toEqual(['src/a.ts']);
  });

  it('excludes files matching a glob entry', () => {
    const dir = tempTree(['src/api.ts', 'src/api.generated.ts', 'src/deep/x.generated.ts']);
    expect(relative(dir, collectFiles(['src'], dir, ['**/*.generated.ts']).files)).toEqual(['src/api.ts']);
  });

  it('applies exclusion to explicitly named files too', () => {
    const dir = tempTree(['src/api.generated.ts']);
    expect(collectFiles(['src/api.generated.ts'], dir, ['**/*.generated.ts']).files).toEqual([]);
  });

  it('excludes nothing when ignorePaths is empty', () => {
    const dir = tempTree(['dist/a.js']);
    expect(relative(dir, collectFiles(['.'], dir, []).files)).toEqual(['dist/a.js']);
  });
});

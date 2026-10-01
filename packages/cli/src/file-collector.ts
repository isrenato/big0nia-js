import * as fs from 'node:fs';
import * as path from 'node:path';
import picomatch from 'picomatch';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

export interface CollectedFiles {
  /** Absolute paths of every source file to analyse, sorted and de-duplicated. */
  files: string[];
  /** The given paths (as written) that do not exist. */
  missingPaths: string[];
}

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath)) && !filePath.endsWith('.d.ts');
}

function walk(dir: string, out: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(entryPath, out);
    } else if (entry.isFile() && isSourceFile(entryPath)) {
      out.push(entryPath);
    }
  }
}

/**
 * Builds a predicate that excludes a file when its cwd-relative path (forward slashes) contains any
 * `ignorePaths` entry as a substring, or matches it as a glob.
 */
function ignoreMatcher(cwd: string, ignorePaths: string[]): (absolutePath: string) => boolean {
  const globs = ignorePaths.map((pattern) => picomatch(pattern, { dot: true }));

  return (absolutePath) => {
    const relativePath = path.relative(cwd, absolutePath).split(path.sep).join('/');
    return ignorePaths.some((entry, i) => relativePath.includes(entry) || globs[i](relativePath));
  };
}

export function collectFiles(paths: string[], cwd: string, ignorePaths: string[]): CollectedFiles {
  const found: string[] = [];
  const missingPaths: string[] = [];

  for (const given of paths) {
    const absolute = path.resolve(cwd, given);
    if (!fs.existsSync(absolute)) {
      missingPaths.push(given);
      continue;
    }

    if (fs.statSync(absolute).isDirectory()) {
      walk(absolute, found);
    } else if (isSourceFile(absolute)) {
      found.push(absolute);
    }
  }

  const isIgnored = ignoreMatcher(cwd, ignorePaths);
  return { files: [...new Set(found)].filter((file) => !isIgnored(file)).sort(), missingPaths };
}

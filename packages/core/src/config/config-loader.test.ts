// packages/core/src/config/config-loader.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig } from './config-loader.js';
import { ConfigError } from './config-error.js';

function withTempDir(write: (dir: string) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'big0nia-config-'));
  write(dir);
  return dir;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempDirWith(filename: string | null, contents?: string): string {
  const dir = withTempDir((d) => {
    if (filename) fs.writeFileSync(path.join(d, filename), contents ?? '');
  });
  tempDirs.push(dir);
  return dir;
}

describe('loadConfig', () => {
  it('returns an empty ignorePaths list when no config file exists', () => {
    expect(loadConfig(tempDirWith(null))).toEqual({ ignorePaths: [] });
  });

  it('returns an empty ignorePaths list when the config file has no ignorePaths key', () => {
    expect(loadConfig(tempDirWith('big0nia.config.json', '{}'))).toEqual({ ignorePaths: [] });
  });

  it('loads ignorePaths from big0nia.config.json', () => {
    const dir = tempDirWith('big0nia.config.json', '{"ignorePaths": ["dist", "**/*.generated.ts"]}');
    expect(loadConfig(dir)).toEqual({ ignorePaths: ['dist', '**/*.generated.ts'] });
  });

  it('falls back to .big0niarc.json when big0nia.config.json is absent', () => {
    const dir = tempDirWith('.big0niarc.json', '{"ignorePaths": ["build"]}');
    expect(loadConfig(dir)).toEqual({ ignorePaths: ['build'] });
  });

  it('prefers big0nia.config.json when both files exist', () => {
    const dir = tempDirWith('big0nia.config.json', '{"ignorePaths": ["from-config"]}');
    fs.writeFileSync(path.join(dir, '.big0niarc.json'), '{"ignorePaths": ["from-rc"]}');
    expect(loadConfig(dir)).toEqual({ ignorePaths: ['from-config'] });
  });

  it('throws ConfigError on malformed JSON', () => {
    const dir = tempDirWith('big0nia.config.json', '{not json');
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it('throws ConfigError when the top level is not an object', () => {
    const dir = tempDirWith('big0nia.config.json', '[]');
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it('throws ConfigError when ignorePaths is not an array', () => {
    const dir = tempDirWith('big0nia.config.json', '{"ignorePaths": "dist"}');
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it('throws ConfigError when ignorePaths contains a non-string', () => {
    const dir = tempDirWith('big0nia.config.json', '{"ignorePaths": ["dist", 42]}');
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });

  it('throws ConfigError when ignorePaths contains an empty string', () => {
    const dir = tempDirWith('big0nia.config.json', '{"ignorePaths": [""]}');
    expect(() => loadConfig(dir)).toThrow(ConfigError);
  });
});

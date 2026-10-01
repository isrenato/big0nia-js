// packages/core/src/config/config-loader.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AnalyzerConfig } from './analyzer-config.js';
import { ConfigError } from './config-error.js';

const CONFIG_FILENAMES = ['big0nia.config.json', '.big0niarc.json'];

export function loadConfig(cwd: string): AnalyzerConfig {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.join(cwd, filename);
    if (fs.existsSync(configPath)) return parseConfigFile(configPath);
  }

  return { ignorePaths: [] };
}

function parseConfigFile(configPath: string): AnalyzerConfig {
  const raw = fs.readFileSync(configPath, 'utf8');

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new ConfigError(`Malformed config file ${configPath}: ${(error as Error).message}`);
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new ConfigError(`Config file ${configPath} must decode to a map, got ${describeType(data)}.`);
  }

  const record = data as Record<string, unknown>;
  if (!('ignorePaths' in record)) return { ignorePaths: [] };

  return { ignorePaths: validateIgnorePaths(record.ignorePaths, configPath) };
}

function validateIgnorePaths(value: unknown, configPath: string): string[] {
  if (!Array.isArray(value)) {
    throw new ConfigError(`Config key "ignorePaths" in ${configPath} must be a list of strings, got ${describeType(value)}.`);
  }

  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new ConfigError(`Config key "ignorePaths" in ${configPath} must contain only strings, found ${describeType(entry)}.`);
    }
    if (entry === '') {
      throw new ConfigError(`Config key "ignorePaths" in ${configPath} must not contain empty strings.`);
    }
  }

  return value as string[];
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

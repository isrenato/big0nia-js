import type { ESLint, Linter, Rule } from 'eslint';
import { arrayRebuildInLoop } from './rules/array-rebuild-in-loop.js';
import { interproceduralLoopJoin } from './rules/interprocedural-loop-join.js';
import { linearScanInLoop } from './rules/linear-scan-in-loop.js';
import { nestedLoopJoin } from './rules/nested-loop-join.js';
import { repeatedSortInLoop } from './rules/repeated-sort-in-loop.js';

const rules: Record<string, Rule.RuleModule> = {
  'nested-loop-join': nestedLoopJoin,
  'interprocedural-loop-join': interproceduralLoopJoin,
  'array-rebuild-in-loop': arrayRebuildInLoop,
  'linear-scan-in-loop': linearScanInLoop,
  'repeated-sort-in-loop': repeatedSortInLoop,
};

interface Big0niaPlugin extends ESLint.Plugin {
  rules: Record<string, Rule.RuleModule>;
  configs: { recommended: Linter.Config };
}

const plugin: Big0niaPlugin = {
  meta: { name: '@big0nia/eslint-plugin', version: '0.1.0' },
  rules,
  configs: { recommended: {} },
};

plugin.configs.recommended = {
  name: '@big0nia/recommended',
  plugins: { '@big0nia': plugin },
  rules: Object.fromEntries(Object.keys(rules).map((id) => [`@big0nia/${id}`, 'warn'])),
};

export default plugin;

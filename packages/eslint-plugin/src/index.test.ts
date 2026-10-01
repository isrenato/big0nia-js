import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import big0nia from './index.js';

const RULE_IDS = [
  'nested-loop-join',
  'interprocedural-loop-join',
  'array-rebuild-in-loop',
  'linear-scan-in-loop',
  'repeated-sort-in-loop',
];

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'big0nia-plugin-')));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

fs.writeFileSync(
  path.join(dir, 'helper.ts'),
  'export function matchOrders(user) {\n  for (const order of orders) {\n    if (user.id === order.userId) {}\n  }\n}\n'
);

const COMBINED = `import { matchOrders } from './helper.js';

for (const user of users) {
  for (const order of orders) {
    if (user.id === order.userId) {}
  }
}

for (const user of users) {
  matchOrders(user);
}

for (const item of items) {
  result = [...result, item];
}

for (const user of users) {
  if (blockedIds.includes(user.id)) {}
}

for (const item of items) {
  scores.sort();
}
`;

describe('@big0nia/eslint-plugin', () => {
  it('exposes exactly the five rules', () => {
    expect(Object.keys(big0nia.rules).sort()).toEqual([...RULE_IDS].sort());
  });

  it('ships only the flat recommended preset, with every rule at warn', () => {
    expect(Object.keys(big0nia.configs)).toEqual(['recommended']);
    const recommended = big0nia.configs.recommended;
    expect(recommended.plugins).toEqual({ '@big0nia': big0nia });
    expect(recommended.rules).toEqual(Object.fromEntries(RULE_IDS.map((id) => [`@big0nia/${id}`, 'warn'])));
  });

  it('reports one warning per rule on a combined fixture through the recommended preset', () => {
    const linter = new Linter({ cwd: dir });
    const messages = linter.verify(
      COMBINED,
      [{ files: ['**/*.ts'], languageOptions: { parser: tsParser } }, big0nia.configs.recommended],
      { filename: path.join(dir, 'combined.ts') }
    );

    expect(messages.map((m) => m.ruleId).sort()).toEqual(RULE_IDS.map((id) => `@big0nia/${id}`).sort());
    expect(messages.every((m) => m.severity === 1)).toBe(true);
  });

  it('lets a single rule be enabled at error severity', () => {
    const linter = new Linter({ cwd: dir });
    const messages = linter.verify(
      COMBINED,
      [
        { files: ['**/*.ts'], languageOptions: { parser: tsParser }, plugins: { '@big0nia': big0nia } },
        { rules: { '@big0nia/nested-loop-join': 'error' } },
      ],
      { filename: path.join(dir, 'combined.ts') }
    );

    expect(messages.map((m) => [m.ruleId, m.severity])).toEqual([['@big0nia/nested-loop-join', 2]]);
  });
});

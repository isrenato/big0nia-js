import { afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { interproceduralLoopJoin } from './interprocedural-loop-join.js';
import { defaultParserRuleTester, typescriptRuleTester } from '../test-support/rule-tester.js';

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'big0nia-eslint-')));
fs.writeFileSync(
  path.join(dir, 'helper.ts'),
  `export function matchOrders(user) {
  for (const order of orders) {
    if (user.id === order.userId) {
      console.log(order);
    }
  }
}
`
);
fs.writeFileSync(path.join(dir, 'plain.js'), 'export function matchOrders(user) {\n  for (const order of orders) {\n    if (user.id === order.userId) {}\n  }\n}\n');

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const CALLER = (specifier: string) => `import { matchOrders } from '${specifier}';
for (const user of users) {
  matchOrders(user);
}
`;

typescriptRuleTester().run('interprocedural-loop-join', interproceduralLoopJoin, {
  valid: [
    { code: CALLER('./missing.js'), filename: path.join(dir, 'missing-caller.ts') },
    { code: CALLER('some-package'), filename: path.join(dir, 'package-caller.ts') },
    { code: 'for (const user of users) { console.log(user); }', filename: path.join(dir, 'clean.ts') },
  ],
  invalid: [
    {
      code: CALLER('./helper.js'),
      filename: path.join(dir, 'run.ts'),
      errors: [
        {
          message:
            'Potential O(n × m) algorithm: every item is compared against every orders using id vs userId, via matchOrders(). ' +
            'Estimated complexity: O(users × orders). ' +
            `Tip: Index orders by userId before the loop, then look up matches instead of scanning (inner loop at ${path.join(dir, 'helper.ts')}:2). ` +
            'Possible complexity after optimization: O(users + orders).',
          line: 2,
        },
      ],
    },
  ],
});

defaultParserRuleTester().run('interprocedural-loop-join (default parser)', interproceduralLoopJoin, {
  valid: [],
  invalid: [{ code: CALLER('./plain.js'), filename: path.join(dir, 'run.js'), errors: 1 }],
});

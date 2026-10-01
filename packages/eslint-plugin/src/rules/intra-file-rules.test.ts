import { arrayRebuildInLoop } from './array-rebuild-in-loop.js';
import { linearScanInLoop } from './linear-scan-in-loop.js';
import { nestedLoopJoin } from './nested-loop-join.js';
import { repeatedSortInLoop } from './repeated-sort-in-loop.js';
import { defaultParserRuleTester, typescriptRuleTester } from '../test-support/rule-tester.js';

const ts = typescriptRuleTester();
const js = defaultParserRuleTester();

const JOIN = `for (const user of users) {
  for (const order of orders) {
    if (user.id === order.userId) {
      console.log(order);
    }
  }
}`;

const JOIN_MESSAGE =
  'Potential O(n × m) algorithm: every user is compared against every order using id vs userId. ' +
  'Estimated complexity: O(users × orders). ' +
  'Tip: Index orders by userId before the loop, then look up matches instead of scanning. ' +
  'Possible complexity after optimization: O(users + orders).';

ts.run('nested-loop-join', nestedLoopJoin, {
  valid: [
    'for (const user of users) { for (const order of orders) { console.log(user, order); } }',
    `for (const user of ['a', 'b']) { for (const order of orders) { if (user.id === order.userId) {} } }`,
  ],
  invalid: [
    { code: JOIN, filename: 'example.ts', errors: [{ message: JOIN_MESSAGE, line: 1 }] },
    { code: `type U = { id: number };\n${JOIN}`, filename: 'example.tsx', errors: [{ message: JOIN_MESSAGE, line: 2 }] },
  ],
});

js.run('nested-loop-join (default parser)', nestedLoopJoin, {
  valid: ['for (const user of users) { console.log(user); }'],
  invalid: [{ code: JOIN, filename: 'example.js', errors: [{ message: JOIN_MESSAGE, line: 1 }] }],
});

ts.run('array-rebuild-in-loop', arrayRebuildInLoop, {
  valid: ['for (const item of items) { result.push(item); }', 'for (const item of items) { result = other.concat([item]); }'],
  invalid: [
    {
      code: 'for (const item of items) {\n  result = result.concat([item]);\n}',
      errors: [
        {
          message:
            'Potential O(n²) algorithm: result.concat(...) rebuilds result from scratch on every iteration. ' +
            'Tip: Replace result.concat(...) with result.push(...) (or an equivalent append), or build the pieces separately and concatenate once after the loop.',
          line: 1,
        },
      ],
    },
  ],
});

js.run('array-rebuild-in-loop (default parser)', arrayRebuildInLoop, {
  valid: ['for (const item of items) { result.push(item); }'],
  invalid: [{ code: 'for (const item of items) { result = [...result, item]; }', filename: 'example.js', errors: 1 }],
});

ts.run('linear-scan-in-loop', linearScanInLoop, {
  valid: ['for (const user of users) { if (users.includes(user.manager)) {} }', "for (const user of users) { if (['a'].includes(user.id)) {} }"],
  invalid: [
    {
      code: 'for (const user of users) {\n  if (blockedIds.includes(user.id)) {\n    console.log(user);\n  }\n}',
      errors: [
        {
          message:
            'Potential O(n × m) algorithm: every user is checked against blockedIds using includes(). Estimated complexity: O(users × blockedIds). ' +
            'Tip: Convert blockedIds to a Set/Map before the loop, then use .has()/.get() instead of includes(). Possible complexity after optimization: O(users + blockedIds).',
          line: 1,
        },
      ],
    },
  ],
});

js.run('linear-scan-in-loop (default parser)', linearScanInLoop, {
  valid: ['for (const user of users) { console.log(user); }'],
  invalid: [{ code: 'users.forEach((user) => { if (ids.indexOf(user.id)) {} });', filename: 'example.js', errors: 1 }],
});

ts.run('repeated-sort-in-loop', repeatedSortInLoop, {
  valid: ['for (const item of items) { scores.sort(); scores = load(); }', 'for (const item of items) { console.log(item); }'],
  invalid: [
    {
      code: 'for (const item of items) {\n  scores.sort((a, b) => a - b);\n}',
      errors: [
        {
          message:
            'Potential wasted work: scores.sort(...) re-sorts scores on every iteration, but scores is never modified inside this loop. ' +
            'Tip: Move scores.sort(...) above the loop — sorting an already-sorted, unchanged array repeatedly wastes work per iteration for no benefit.',
          line: 2,
        },
      ],
    },
  ],
});

js.run('repeated-sort-in-loop (default parser)', repeatedSortInLoop, {
  valid: ['for (const item of items) { console.log(item); }'],
  invalid: [{ code: 'for (const item of items) { scores.sort(); }', filename: 'example.js', errors: 1 }],
});

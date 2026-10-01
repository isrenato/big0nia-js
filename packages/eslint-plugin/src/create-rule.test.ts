import type { LoopRule } from '@big0nia/core';
import { lineOf } from '@big0nia/core';
import { createBig0niaRule } from './create-rule.js';
import { defaultParserRuleTester, typescriptRuleTester } from './test-support/rule-tester.js';

const stubRule: LoopRule = {
  id: 'stub-rule',
  check(loop, _preceding, ctx) {
    return loop.kind === 'forOf'
      ? { ruleId: 'stub-rule', line: lineOf(ctx.sourceFile, loop.node), message: 'Loop found.', tip: 'Do less.' }
      : null;
  },
};

const rule = createBig0niaRule(stubRule, { description: 'Stub rule for testing the factory.', crossFile: false });

typescriptRuleTester().run('stub-rule (typescript-eslint parser)', rule, {
  valid: ['const x = 1;', 'for (let i = 0; i < xs.length; i++) {}'],
  invalid: [
    {
      code: 'const a = 1;\nfor (const x of xs) {}\n',
      errors: [{ message: 'Loop found. Tip: Do less.', line: 2, column: 1 }],
    },
  ],
});

defaultParserRuleTester().run('stub-rule (default parser)', rule, {
  valid: ['const x = 1;'],
  invalid: [{ code: 'for (const x of xs) {}', errors: [{ message: 'Loop found. Tip: Do less.', line: 1 }] }],
});

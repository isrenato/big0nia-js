import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/** A RuleTester that parses with `@typescript-eslint/parser`, as the plugin's documented setup does. */
export function typescriptRuleTester(): RuleTester {
  return new RuleTester({ languageOptions: { parser: tsParser } });
}

/** A RuleTester on ESLint's default parser, exercising the plugin's own-parse fallback. */
export function defaultParserRuleTester(): RuleTester {
  return new RuleTester();
}

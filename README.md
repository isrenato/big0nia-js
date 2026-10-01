# big0nia (JavaScript/TypeScript)

[![CI](https://github.com/isrenato/big0nia-js/actions/workflows/ci.yml/badge.svg)](https://github.com/isrenato/big0nia-js/actions/workflows/ci.yml)

big0nia finds accidental quadratic loops in JavaScript and TypeScript: nested loops that join two collections, `includes()` scans inside loops, arrays rebuilt on every iteration, and sorts repeated for no reason. Every finding names the estimated complexity before the fix and the complexity after it.

It ships primarily as an **ESLint plugin**, so findings show up in the editor and in the lint step a project already runs. There is no separate tool to install or wire into CI. A standalone CLI runs the same rules for projects that don't use ESLint.

This is a port of the detection approach of [PHP big0nia](https://github.com/isrenato/big0nia) to the JS/TS ecosystem. Like the original, it is conservative and purely syntactic, with no type checker. When it can't tell how large a collection is, it reports instead of guessing the loop is cheap.

## Install

### ESLint plugin

```sh
npm install --save-dev @big0nia/eslint-plugin @typescript-eslint/parser
```

```js
// eslint.config.js
import tsParser from '@typescript-eslint/parser';
import big0nia from '@big0nia/eslint-plugin';

export default [
  { files: ['**/*.ts', '**/*.tsx'], languageOptions: { parser: tsParser } },
  big0nia.configs.recommended, // all five rules at "warn"
];
```

Rules can also be configured one by one:

```js
export default [
  { plugins: { '@big0nia': big0nia } },
  { rules: { '@big0nia/nested-loop-join': 'error' } },
];
```

The plugin works with ESLint 9 and 10, flat config only. `@typescript-eslint/parser` is recommended. With ESLint's default parser (plain `.js`), the plugin parses the file itself and reports the same findings.

### CLI

```sh
npm install --save-dev @big0nia/cli
npx big0nia analyse src
npx big0nia analyse --json src lib
```

Output:

```
src/orders.ts:12
  Potential O(n × m) algorithm: every user is compared against every order using id vs userId. Estimated complexity: O(users × orders).
  Tip: Index orders by userId before the loop, then look up matches instead of scanning. Possible complexity after optimization: O(users + orders).

1 issue(s) found.
```

or `No issues found.` when the run is clean. With `--json`, the CLI prints only an array of `{ "file", "line", "ruleId", "message", "tip" }` objects.

Exit codes:

| Code | Meaning |
|------|---------|
| `0`  | Every path existed, every file parsed, no findings. |
| `1`  | Any finding; or a path that doesn't exist (`Path not found: <path>` on stderr, other paths still analysed); or a file that doesn't parse (`Skipping <path>: <message>` on stderr, other files still analysed); or an invalid config file (nothing analysed). |

The CLI analyses `.js`, `.jsx`, `.ts`, and `.tsx` files (not `.d.ts`), recursing into directories and always skipping `node_modules`. Paths in the output are relative to the working directory.

## Rules

Loop kinds are interchangeable in every rule. A canonical indexed `for (let i = 0; i < xs.length; i++)` loop (`.size` also works), a `for...of` loop, and a `.forEach()` with an inline callback all count, so a `.forEach()` nested inside a `for...of` is detected just like two nested `for...of` loops.

### `nested-loop-join`

```ts
// Before: O(users × orders)
for (const user of users) {
  for (const order of orders) {
    if (user.id === order.userId) {
      attach(user, order);
    }
  }
}

// After: O(users + orders)
const ordersByUser = Map.groupBy(orders, (order) => order.userId);
for (const user of users) {
  for (const order of ordersByUser.get(user.id) ?? []) {
    attach(user, order);
  }
}
```

```
Potential O(n × m) algorithm: every user is compared against every order using id vs userId. Estimated complexity: O(users × orders).
Tip: Index orders by userId before the loop, then look up matches instead of scanning. Possible complexity after optimization: O(users + orders).
```

When both loops iterate the same collection, the message uses `O(n²)` and `O(items²)`, and the tip ends with `O(items)`.

How detection works:

1. Find a loop whose body directly contains another loop. The search looks through `if` guards, but not into `else` branches, further loops, or unrelated closures.
2. In the inner loop's body, find an `if` condition containing `===`, `==`, `!==`, or `!=`, alone or combined with `&&` (never through `||`). One side must be rooted in the outer item and the other in the inner item. Roots can be a property (`user.id`), an optional chain (`user?.id`), a getter call (`user.getId()`), or an indexed access (`users[i].id`).
3. Skip the finding if either collection is fixed-size and small (see [Fixed-size collections](#fixed-size-collections)), or if either loop is bounded to one pass by an unconditional `break`, `return`, or `throw` directly in its body.

### `interprocedural-loop-join`

```ts
for (const user of users) {
  matchOrders(user); // matchOrders() loops over orders comparing user.id === order.userId
}
```

```
Potential O(n × m) algorithm: every item is compared against every orders using id vs userId, via matchOrders(). Estimated complexity: O(users × orders).
Tip: Index orders by userId before the loop, then look up matches instead of scanning (inner loop at src/helper.ts:2). Possible complexity after optimization: O(users + orders).
```

How detection works:

1. For each call in the loop body (as a statement, an assignment, a `const x = …` initializer, or a `return`), resolve the call to its declaration. [Resolution](#interprocedural-resolution) is syntax-only.
2. Follow the argument that carries the loop item into the callee, hop by hop, up to 20 hops. Each callee is visited once, so recursion terminates.
3. Report the first callee loop that joins against the forwarded value, naming the call chain (joined with ` → `) and the inner loop's file and line.
4. Apply the same fixed-size and one-pass suppressions as `nested-loop-join`. A call site with a spread argument (`f(...args)`) is not followed.

### `array-rebuild-in-loop`

```ts
// Before: O(n²) copying
for (const item of items) {
  result = result.concat([item]);
}

// After
for (const item of items) {
  result.push(item);
}
```

```
Potential O(n²) algorithm: result.concat(...) rebuilds result from scratch on every iteration.
Tip: Replace result.concat(...) with result.push(...) (or an equivalent append), or build the pieces separately and concatenate once after the loop.
```

The spread form `result = [...result, item]` reports `Potential O(n²) algorithm: [...result, ...] rebuilds result from scratch on every iteration.`

How detection works:

1. In the loop body, looking through `if`/`else if`/`else` but not into nested loops (those are checked on their own), find `arr = <x>.concat(...)` where `arr` is the receiver or one of the arguments, or `arr = [...arr, ...]`.
2. A `concat()` or spread that doesn't re-include the assigned variable is not flagged.
3. Skip the finding if the loop's own collection is fixed-size.

### `linear-scan-in-loop`

```ts
// Before: O(users × blockedIds)
for (const user of users) {
  if (blockedIds.includes(user.id)) {
    hide(user);
  }
}

// After: O(users + blockedIds)
const blocked = new Set(blockedIds);
for (const user of users) {
  if (blocked.has(user.id)) {
    hide(user);
  }
}
```

```
Potential O(n × m) algorithm: every user is checked against blockedIds using includes(). Estimated complexity: O(users × blockedIds).
Tip: Convert blockedIds to a Set/Map before the loop, then use .has()/.get() instead of includes(). Possible complexity after optimization: O(users + blockedIds).
```

How detection works:

1. In an `if` condition in the loop body (also through `&&`, `||`, and `!`), find a call to `.includes()`, `.indexOf()`, or `.find()`. The searched-for value, or for `.find()` one side of the predicate's equality comparison, must be rooted in the loop item.
2. Skip it when the scanned collection is the loop's own collection or is fixed-size, or when the loop is bounded to one pass.

### `repeated-sort-in-loop`

```ts
// Before
for (const item of items) {
  scores.sort((a, b) => a - b);
  use(item, scores[0]);
}

// After
scores.sort((a, b) => a - b);
for (const item of items) {
  use(item, scores[0]);
}
```

```
Potential wasted work: scores.sort(...) re-sorts scores on every iteration, but scores is never modified inside this loop.
Tip: Move scores.sort(...) above the loop — sorting an already-sorted, unchanged array repeatedly wastes work per iteration for no benefit.
```

How detection works:

1. In the loop body, looking through `if`/`else if`/`else` but not into nested loops, find `arr.sort(...)`, with or without a comparator.
2. Report it only if `arr` is never modified anywhere in the loop body, nested loops included. Modification means an assignment or compound assignment, `++`/`--`/`delete` on an element, or a mutating call (`push`, `pop`, `shift`, `unshift`, `splice`, `fill`, `copyWithin`, `reverse`).
3. Skip the finding if the loop's own collection is fixed-size.

PHP big0nia only targets `usort`/`uasort`/`uksort`. JavaScript has a single `.sort()` method, so this rule targets every `.sort()` call. That is a deliberate adaptation.

### Fixed-size collections

A collection counts as fixed-size, so its findings are suppressed, only if it is one of:

1. A non-empty array literal used directly.
2. A `const`/`let` whose last assignment before the loop, in the same statement list, is a non-empty array literal.
3. A class field or TypeScript constructor parameter property with a non-empty array-literal default that is never reassigned anywhere in the class.

Everything else, including empty literals, function parameters and return values, `Set`/`Map` literals, and variables the analysis can't fully trace, counts as unknown size and is reported.

### Interprocedural resolution

These calls resolve:

- calls to functions declared in the same file, and `this.method()` within the same class;
- calls on a local assigned `new ClassName()` earlier in the same statement list, unless it is reassigned afterwards, including inside a conditional branch;
- calls on `this.prop` whose declared type names a class;
- calls on a parameter, variable, or property typed with an interface that exactly one analysed class implements directly (`implements` clauses only, not inherited through `extends`);
- named function or method references passed to `.forEach()`/`.map()`, such as `users.forEach(this.handleUser)`;
- functions and classes imported through relative specifiers (`./x`, `../y/z`, with `.ts`/`.tsx`/`.js`/`.jsx` and `index.*` lookup) from another analysed file.

## Config

The CLI reads `big0nia.config.json`, or `.big0niarc.json` if the first doesn't exist, from the working directory:

```json
{ "ignorePaths": ["dist", "**/*.generated.ts"] }
```

Each `ignorePaths` entry excludes a file before it is parsed (a syntax error in an excluded file is never reported). A file is excluded when its path, relative to the working directory, contains the entry as a plain substring or matches it as a glob. Substring matching is intentionally broad, as in PHP big0nia: `dist` also excludes `src/distance.ts`. A missing file or missing key excludes nothing. Malformed JSON, a top level that isn't an object, or an `ignorePaths` that isn't an array of non-empty strings is a fatal error.

The ESLint plugin doesn't read this file. Use ESLint's own `ignores` instead.

## Status

v1 ships the five rules above. It deliberately does **not** cover:

- `while` and `do...while` loops.
- Labeled `break`/`continue`. A labeled `break` doesn't bound a loop to one pass.
- Destructured `for...of` variables (`for (const [k, v] of map)`). No join rule fires on these.
- Non-canonical `for` loops (`<=`, a precomputed bound, a decrementing counter).
- Type-checker information of any kind. Everything is syntax-only.
- In interprocedural resolution: computed-key calls (`obj[key]()`), functions returned from other calls, `.call()`/`.apply()`/`.bind()`, bare or package imports, barrel re-exports (`export * from`), tsconfig path aliases, declarations nested inside other functions, and call sites with spread arguments. These are silently left unresolved, so a missing finding there is expected behaviour.
- PHP big0nia's `self::CONST` array constants and literal `range()` calls as fixed-size sources. Neither has a direct JS equivalent; class constants are covered by the class-field case.

Differences from PHP big0nia and between the two entry points:

- Loop kinds are interchangeable (see [Rules](#rules)), while PHP big0nia only pairs loops of the same kind.
- `repeated-sort-in-loop` targets every `.sort()` (see above).
- The ESLint plugin lints one file at a time. Its interprocedural rule indexes the linted file plus the files reachable from it through relative imports, while the CLI indexes every file in the run. Single-implementor interface dispatch can therefore resolve differently between the two when implementors live outside the import graph.

The packages are pre-release (`0.1.0`) and not yet published to npm.

## Repository layout

```
packages/
  core/           @big0nia/core — AST matchers, rules, project index, config (private, bundled into the other two)
  eslint-plugin/  @big0nia/eslint-plugin
  cli/            @big0nia/cli
```

## Contributing

CI (`.github/workflows/ci.yml`) runs on Node 22 and 24:

```sh
npm ci
npm run typecheck
npm run build
npm run lint    # big0nia's own recommended preset over packages/*/src, zero warnings allowed
npm test
npm run smoke   # the built CLI over packages/*/src must report "No issues found."
```

A finding against big0nia's own source is a bug in a rule, not something to suppress. Rule tests assert the exact message and tip strings quoted in this README, so if you change a message, update the README in the same change.

## License

MIT

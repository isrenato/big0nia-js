# big0nia (JS/TS edition)

An algorithmic-complexity static analyzer for JavaScript and TypeScript —
detecting nested-loop joins that are secretly O(n²), array rebuilds inside
loops, linear scans that should be Set/Map lookups, and sorts that
redundantly re-sort unchanged data. It's a from-scratch port of the
*detection philosophy* of [PHP big0nia](https://github.com/isrenato/big0nia)
(`doloto/big0nia` on Packagist) to the JS/TS ecosystem — same name, same
conservative AST-based approach, not a code port. This repo (`big0nia-js`)
is a separate project from the PHP one, named differently only to avoid
clashing with it on disk and on GitHub.

Once it ships, detection logic will live in one framework-agnostic core
package (`@big0nia/core`), consumed by two thin adapters: an ESLint plugin
(`@big0nia/eslint-plugin`) as the primary distribution channel, and a
standalone CLI (`@big0nia/cli`) for non-ESLint pipelines.

## Status: early development, not yet usable

**What exists right now:** only `packages/core`'s AST foundation — the
shared, framework-agnostic layer every detection rule will be built on.
Specifically:

- `LoopLike` — normalizes `for`, `for...of`, and `.forEach()`/`.map()`
  loops into one shape, so every matcher is written once instead of per
  loop kind.
- A loop collector that walks a TypeScript AST (via the `typescript`
  package's Compiler API — no ESTree, no type checker) and finds every
  loop-like construct in a file.
- A nested-loop finder (locates a loop directly nested inside another,
  through `if` guards).
- A join-signature matcher (finds an equality comparison between an outer
  loop's item and an inner loop's item, through `&&` chains).
- A collection-size classifier (decides whether a collection is provably
  fixed-size, to suppress false positives).
- A loop early-exit analyzer (recognizes a loop structurally bounded to a
  single pass by an unconditional `break`/`return`/`throw`).
- Complexity-label formatting helpers (e.g. `O(users × orders)`).

**What does not exist yet:** any actual detection rule, the CLI, the
ESLint plugin, config loading, interprocedural (cross-function) call
resolution, and the README section any of those would need. There is
nothing here yet that analyzes a real project or reports a finding —
`@big0nia/core` is a private, unpublished package with no public entry
point beyond its internal AST utilities. Don't expect `npm install
@big0nia/cli` or an ESLint config to work yet.

## Repository layout

```
packages/
  core/    @big0nia/core — the AST foundation described above (private, unpublished)
```

`eslint-plugin` and `cli` packages, plus the detection rules themselves,
land in subsequent work.

## Development

```bash
npm install
npm test         # vitest — 63 tests across packages/core
npm run typecheck
```

TypeScript throughout, `strict: true`, ESM (`NodeNext` module resolution),
npm workspaces.

## License

MIT

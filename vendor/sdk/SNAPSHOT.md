# Vendored Tombola SDK snapshot

This directory is a **read-only snapshot** of `sdk/src/` from the companion repo
[Project-Tombola](https://github.com/AtlasBrain/Project-Tombola). Don't edit
files in here directly — your changes will be overwritten on the next sync, and
the source of truth lives in the program repo where it's audited and tested.

## Why a snapshot

The frontend originally imported the SDK via a webpack path alias pointing at
`~/Desktop/Project Tombola/sdk/src`. That works locally but breaks on Vercel
(and any other CI), which only sees this repo's working tree. Snapshotting
unblocks builds without publishing the SDK to a registry.

## Snapshot metadata

- **Source repo:** `~/Desktop/Project Tombola`
- **Source commit:** `f9f94ac3fbe0c709c32e81ec013eb9823eb3827a` (branch `main`)
- **Snapshotted on:** 2026-05-08
- **Excludes:**
  - `*.test.ts` — vitest-specific, frontend doesn't run them.
  - `switchboard.ts` — web3.js v1 boundary that imports `@switchboard-xyz/on-demand`,
    a heavy SDK we don't need on the frontend. Per D-059 in the program repo, this
    file isn't re-exported from `index.ts`; only the program-side smoke test uses
    it. TypeScript would still type-check it if vendored, so we leave it out.
- **Includes:** the two cross-platform patches discussed in `SESSION_HANDOFF.md`'s
  "SDK patches needed in companion repo" section. Once those land in the program
  repo's `main`, the next sync will pick them up automatically.

## How to re-sync

When the program repo's SDK changes (new instructions, account decoders, etc.):

```bash
# From this repo's root
rsync -a --delete \
  --exclude '*.test.ts' \
  --exclude 'switchboard.ts' \
  ~/Desktop/Project\ Tombola/sdk/src/ \
  vendor/sdk/

# Then update the source-commit line in this file to match `git rev-parse HEAD`
# in the companion repo, run `npm run build`, commit.
```

`--delete` drops files that were removed upstream.

## Long-term plan

This is a stop-gap. The right fix is to publish the SDK as a private npm
package and depend on it normally. Until then: any time you re-sync, run the
hygiene gate (`npm run build`) and commit with a message like
`chore(sdk): sync vendor/sdk to <short-sha>`.

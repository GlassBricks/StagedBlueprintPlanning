# Contributing

This file contains info for setting up the project.

We use:

- [TypescriptToLua](https://github.com/TypeScriptToLua/TypeScriptToLua)
- [typed-factorio](https://github.com/GlassBricks/typed-factorio) for type definitions
- [vscode-factoriomod-debug](https://github.com/justarandomgeek/vscode-factoriomod-debug) for development
- [Factorio test](https://github.com/GlassBricks/FactorioTest) for testing
- [gb-tstl-utils](https://github.com/GlassBricks/TstlUtils) for some compiler-assisted utilities

## Overview

[[CLAUDE.md]] is meant for bots, but it's nice for humans, too! Perhaps give it a skim.

## Setup

Fork/clone this repo.

Recommended: install the vscode extension [Factorio Mod Debug](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug).

Checkout the `main` branch:

```sh
git checkout main
```

Run `pnpm install` to install dependencies.
Run `pnpm run test:rebuild` once. This will setup build scripts and other setup for development.

- On windows, you may need to enable [developer mode](https://learn.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) to create symlinks.

### Development

Run tests once with `pnpm run test`.

Watch mode: run `pnpm run watch` and `pnpm exec factorio-test run --watch` separately.

You can also run `pnpm exec factorio-test run --graphics` to launch a graphical window with the same settings as the test does.

Tests will rerun automatically when using `--watch`.

## Testing

Files that end in `.test.ts` are considered tests.
These are currently located in `src/test` or `src/lib/test`.

These are automatically picked up by a custom tstl-plugin to be registered with factorio-test.

## Scripts

These scripts generate some source files:

- `build:locale`: generates a `locale.d.ts` from `src/locale/en`. There is also script `watch:locale`.
- `build:gui-specs`: Used for the factoriojsx framework (see `src/lib/factoriojsx`).
- `build:tstlPlugin`: Builds the TSTL plugin, which facilitates "storing" functions in `storage`. See `src/lib/references.ts` to see how this is done.

If you edit input files, you may need to re-run these scripts.

The functionality provided by these scripts may become a separate project in the future.

## Style

Although this project is written in Typescript, the eventual output is Lua. As such, we do the following:

- This uses [gb-tstl-utils](https://github.com/GlassBricks/TstlUtils); see there for more info.
- Use `==` instead of `===`, and `!=` instead of `!==`. There is no difference in Lua.
- Use `nil` instead of `undefined`. Don't use `null`.

# Contributing

This file contains info for setting up and contributing to this project.

We use:

- [TypescriptToLua](https://github.com/TypeScriptToLua/TypeScriptToLua)
- [typed-factorio](https://github.com/GlassBricks/typed-factorio) for type definitions
- [vscode-factoriomod-debug](https://github.com/justarandomgeek/vscode-factoriomod-debug) for development
- [Factorio test](https://github.com/GlassBricks/FactorioTest) for testing
- [gb-tstl-utils](https://github.com/GlassBricks/TstlUtils) for some compiler-assisted utilities

## Overview
[[CLAUDE.md]] is meant for bots, but it's nice for humans, too! Perhaps give it a read.

## Setup

Fork/clone this repo.
Open this project in vscode, and install the vscode extension [Factorio Mod Debug](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug).

Checkout the `main` branch:

```sh
git checkout main
```

Run `npm install` to install dependencies.

Run `npm run test` once. This will run some build scripts and other setup for development.

- On windows, you may need to enable [developer mode](https://learn.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development) to create symlinks.

### Development

Run `npm run watch` to watch for changes.

Launch the `Test run` vscode launch configuration or `Test debug`, which is slower but allows debugging.

If you launch Factorio factorio with --enable-lua-udp 14434, tests will rerun automatically (with the watch script).
This is handled by the tstlPlugin and src/test/test-init.ts .

## Testing

Files that end in `.test.ts` are considered tests, and will be run by `factorio-test`.
These are currently located in `src/test` or `src/lib/test`.

This project strives to have as high test coverage as possible.

## Scripts

These scripts are used to generate some files:

- `build:locale`: generates a `locale.d.ts` from `src/locale`. There is also `watch:locale` script for this.
- `build:gui-specs`: Used for the factoriojsx framework (see `src/lib/factoriojsx`).
- `build:tstlPlugin`: Builds the TSTL plugin which facilitates "storing" functions in global (in a consistent way). See `src/lib/references.ts` to see how this is done.

If you edit the corresponding files, you may need to re-run these scripts.

The functionality provided by these scripts may become a separate project in the future.

## Style

Although this project is written in Typescript, the eventual output is Lua. As such, we do the following:

- This uses [gb-tstl-utils](https://github.com/GlassBricks/TstlUtils); see there for more info.
- Use `==` instead of `===`, and `!=` instead of `!==`. There is no difference in Lua, and double equals is easier to read.
- Use `nil` as a shorthand for, and instead of `undefined`. Don't use `null`.

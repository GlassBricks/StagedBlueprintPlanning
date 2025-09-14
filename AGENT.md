## Project Overview

Staged Blueprint Planning is a Factorio mod for designing staged blueprints, allows players to plan complex multi-stage construction projects within Factorio.
- In TypeScript, compiled to Lua via TypeScriptToLua
- Architecture: Factorio mod, event-driven, custom UI framework

## Dev Environment

- Node.js with npm
- VS Code with [Factorio Mod Debug](https://marketplace.visualstudio.com/items?itemName=justarandomgeek.factoriomod-debug) extension
- Factorio installed (for testing)

### Workflows
- `npm run build:test`, `npm run watch` - rebuilds mod (with tests)
- Testing: Either, use VS Code launch configurations `Test run` or `Test debug`, and tests are manually triggered in-game; or run `npm run test` script for one-time test run & automation (slower).

### npm scripts
- `build:locale`, `watch:locale` - Generates locale definitions from `src/locale`. Rerun this if src/locale changes
- `build:gui-specs` - Builds GUI specifications for factoriojsx framework, using typed-factorio definitions
- `build:tstlPlugin` - Builds custom TSTL plugin
- `format:fix` - Prettier
- `lint` - ESLint
- `check` - Full validation (format, lint, test, git tree is clean)

Read package.json for all scripts.

## Code Style

Since code compiles to Lua:
- Use `==` instead of `===`, `!=` instead of `!==` (no difference in Lua)
- Use `nil` instead of `undefined`. Avoid `null`
- Use TypeScript imports normally; TSTL handles conversion

- Prettier config: no semi, printWidth 120
- Use explicit member accessibility (no-public rule)
- Explicit module boundary types required

- Test files end with `.test.ts`
- Tests and test-only utils are located in `src/test/` or `src/lib/test/`.
- Test file names usually mirror the file they test; e.g `/src/foo/bar.ts` -> `/src/test/foo/bar.test.ts`
- Project strives for high test coverage. All new features should include tests.

## Architecture

### Technologies, libs
- TypeScriptToLua (TSTL)
- factorio-test: Testing framework
- tstl-expect: jest-like assertions for tstl
- typed-factorio: Type definitions for Factorio API

Highly recommended: _grep_ then read files in node_modules/typed-factorio/, in particular `node_modules/typed-factorio/runtime/index.d.ts` and `node_modules/typed-factorio/runtime/generated/*.d.ts`. The files in `generated` are very big, ALWAYS grep/search for specific lines/sections first instead of reading the entire file!!

Migrations: any time editing something in `storage`, make sure to include migrations:
- `src/project.index.ts` for everything project-related
- For smaller things, use the mini framework in `src/lib/migrations.ts`

### Project Structure
Make sure to also use the custom libs seen below
```
src/
├── project/            # Main "backend" functionality (projects)
├── blueprints/         # Blueprint handling logic
├── copy-paste/         # Copy-paste (with stage info) functionality
├── entity/             # Handling individual entities
├── ui/                 # UI components "frontend"
├── lib/                # Core libraries and utilities
│   ├── event/          # Custom event system
│   ├── factoriojsx/    # Custom JSX framework for Factorio GUI
│   └── geometry/       # Geometry utilities
├── utils/              # General utilities
├── control.ts          # Main mod entry point

├── prototypes/         # Factorio prototypes, data stage
└── data.ts
```

### Important files:
`src/entity/ProjectEntity.ts`: the main data for individual entities
`src/entity/ProjectContent.ts`: the main data for a project's entities
`src/project/UserProject.ts`: full project & stage definition
`src/ui/ProjectSettings.tsx`: one of the main user-facing components

### "Main" event pipeline, for editing entities in projects
in `src/project`...
`event-handlers.ts` "parses" Factorio Events into more useful ones
-> `user-actions.ts` takes events, decides what to do with them; includes player interactions
-> `project-updates.ts` actions for updating projects (typically ProjectContent)
-> `world-updates.ts`, `entity-highlights.ts`: updates world state to match project changes

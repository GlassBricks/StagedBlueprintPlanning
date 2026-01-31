## Project Overview

Staged Blueprint Planning is a Factorio mod for designing multi-stage blueprints. Written in TypeScript and compiled to Lua via TypeScriptToLua (TSTL).

## Development Commands

```bash
pnpm run build:test        # Full build (run once initially, or after clean)
pnpm run build:release     # Production build
pnpm run test              # Run tests (incremental build)
pnpm run test:rebuild      # Clean, rebuild, and test

pnpm run test "filter1" "foo%-test > block name" # Run specific test (Lua patterns: escape - as %-)

pnpm run format:fix        # Prettier
pnpm run lint              # ESLint
pnpm run check             # Full validation (format, lint, test, git tree clean)
```

Run format and lint after changes.

### Build Scripts

These are run as part of full rebuild.

- `pnpm run build:locale` - Generates `src/locale/index.d.ts` from `src/locale`
- `pnpm run build:gui-specs` - Generates GUI specs for factoriojsx framework
- `pnpm run build:tstlPlugin` - Builds custom TSTL plugin for function storage

## Code Style

- No semicolons, 120 char line width
- Explicit member accessibility required (`accessibility: "no-public"`)
- Explicit module boundary types
- Test files end with `.test.ts`
- Avoid casting to `any` in new code. Prefer casting to an explicit type; creating types if it does not exist yet.

### Lua

Since Typescript code compiles to Lua:

- Use `==` instead of `===`, `!=` instead of `!==`
- Use `nil` instead of `undefined`, avoid `null`

## Architecture

- TypeScriptToLua (TSTL)
- typed-factorio for Factorio API type definitions
- factorio-test for testing
- gb-tstl-utils for compiler utilities

### Key Directories

```
src/
├── project/            # Main backend: project state & logic
├── entity/             # Entity handling
│   ├── ProjectEntity.ts      # Individual entity data
│   └── ProjectContent.ts     # Project's entities collection
├── blueprints/         # Blueprint import/export
├── ui/                 # Frontend UI components
├── lib/                # Core libraries
│   ├── event/          # Custom event system (Event, Property, GlobalEvent)
│   ├── factoriojsx/    # Custom JSX framework for Factorio GUI
│   ├── geometry/       # Geometry utilities
│   ├── references.ts   # Function storage system (uses custom TSTL plugin)
│   └── migration.ts    # Migration framework
├── utils/              # General utilities
├── test/               # Tests (mirrors src/ structure)
├── prototypes/         # Factorio data stage prototypes
└── control.ts          # Mod entry point
```

- `src/entity/ProjectEntity.ts` - Individual entity data structure
- `src/entity/ProjectContent.ts` - Project entities collection
- `src/project/UserProject.ts` - Full project & stage definitions
- `src/ui/ProjectSettings.tsx` - Main UI component
- `src/lib/references.ts` - Global function storage system

#### Main Event Pipeline

in `src/project/`:

1. `event-handlers.ts` - Parses Factorio events into custom events
2. `user-actions.ts` - Handles player interactions, decides actions
3. `project-updates.ts` - Updates ProjectContent
4. `world-updates.ts`, `entity-highlights.ts` - Syncs world state with project

### Custom Libraries

**factoriojsx**: (`src/lib/factoriojsx/`): Provides JSX GUI creation for Factorio
**Event System** (`src/lib/event/`): Custom reactive event/property system
**References** (`src/lib/references.ts`): Allows registered functions to be stored in `storage`

### Migrations

**IMPORTANT**: when editing anything that ends up in the `storage` global (project data, player data, etc.), always add a migration. 
See [docs/Migrations.md](docs/Migrations.md) for full reference and patterns.

### Testing

- Place in in `src/test/` or `src/lib/test/`
- test file names mirror source: `src/foo/bar.ts` → `src/test/foo/bar.test.ts`
- High test coverage expected
- Framework: factorio-test (Jest-like), assertions via tstl-expect
- Lifecycle hooks: `before_each`, `after_each`, `before_all`, `after_all`

**Test Naming Standards:**

- Test names: Lowercase descriptive sentences starting with action verbs
  - `test("returns nil when stage is lower than first stage", ...)`
  - `test("should throw error when moving past last stage", ...)`
- Describe blocks: Use method names with `()` or feature names
  - `describe("adjustValueAtStage()", ...)`
  - `describe("wire connection lifecycle", ...)`
- Parameterized tests: Use `test.each()` with descriptive format strings. jest-like var substitutions supported
  - `test.each([...])("%$: %s + %s = %s", (a, b, expected) => ...)`

**Test Structure:**

- Use specific matchers: `toBe`, `toEqual`, `toBeNil`, `toHaveLength`, `toError()`
- Extract complex setup to helper functions or factory files
- One logical assertion per test (multiple expects OK if testing same concept)

For Factorio API documentation, prefer inspecting `node_modules/typed-factorio/**/*.d.ts` instead of online documentation.

## Notes

- with `noEmitOnError`, TSTL warnings will cause no emit, possibly failing tests
- For user-visible changes, also update src/changelog.txt

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Staged Blueprint Planning is a Factorio mod for designing multi-stage blueprints. Written in TypeScript and compiled to Lua via TypeScriptToLua (TSTL).

## Development Commands

### Build & Watch

```bash
npm run build:test        # Build with tests (only for checking build)
npm run build:release     # Production build
npm run watch             # Watch mode for development
```

### Testing

```bash
npm run test              # Run all tests via factorio-test. Runs build as part of pre-test, no need to build first
```

### Code Quality

```bash
npm run format:fix        # Format with Prettier
npm run lint              # Run ESLint
npm run check             # Full validation (format, lint, test, git tree clean)
```

### Build Scripts

- `npm run build:locale` - Generates `src/locale/index.d.ts` from `src/locale`
- `npm run build:gui-specs` - Generates GUI specs for factoriojsx framework
- `npm run build:tstlPlugin` - Builds custom TSTL plugin for function storage

## Code Style

### Lua-Specific Conventions

Since code compiles to Lua:

- Use `==` instead of `===`, `!=` instead of `!==`
- Use `nil` instead of `undefined`, avoid `null`

### TypeScript Style

- No semicolons, 120 char line width (Prettier)
- Explicit member accessibility required (`accessibility: "no-public"`)
- Explicit module boundary types required
- Test files end with `.test.ts`
- Avoid casting to `any` in new code. Prefer casting to an explicit type; creating one if it does not exist yet.

## Architecture

### Tech Stack

- TypeScriptToLua (TSTL)
- typed-factorio for Factorio API type definitions
- factorio-test for testing
- gb-tstl-utils for compiler utilities

Note:
- with `noEmitOnError`, TSTL warnings will cause no emit, possibly failing tests

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

### Main Event Pipeline (project editing)

Located in `src/project/`:

1. `event-handlers.ts` - Parses Factorio events into custom events
2. `user-actions.ts` - Handles player interactions, decides actions
3. `project-updates.ts` - Updates ProjectContent
4. `world-updates.ts`, `entity-highlights.ts` - Syncs world state with project

### Custom Libraries

**factoriojsx**: Custom JSX framework for Factorio GUI (see `src/lib/factoriojsx/`)

- TSX files use: `jsxFactory: "FactorioJsx.createElement"`
- Provides React-like GUI creation for Factorio

**Event System** (`src/lib/event/`): Custom reactive event/property system

- `Event.ts` - Event emitters
- `Property.ts` - Reactive properties
- `GlobalEvent.ts` - Global event bus

**References** (`src/lib/references.ts`): Function storage using custom TSTL plugin

- Enables consistent global function storage
- See tstlPlugin for implementation

### Migrations

When editing anything in `storage`:
See mini framework in `src/lib/migration.ts`

- Place project-related migrations in: `src/project/index.ts`
- use `$CURRENT_VERSION` (global variable) as a placeholder for current version, will be substituted by a script during publishing

Don't forget to consider if migrations in planning.

### Testing

- Tests in `src/test/` or `src/lib/test/`
- Test file names mirror source: `src/foo/bar.ts` → `src/test/foo/bar.test.ts`
- High test coverage expected
- Framework: factorio-test (Jest-like), assertions via tstl-expect
- Lifecycle hooks: `before_each`, `after_each`, `before_all`, `after_all`

**Test Naming Standards:**

- Test names: Lowercase descriptive sentences starting with action verbs
  - ✅ `test("returns nil when stage is lower than first stage", ...)`
  - ✅ `test("should throw error when moving past last stage", ...)`
- Describe blocks: Use method names with `()` or feature names
  - ✅ `describe("adjustValueAtStage()", ...)`
  - ✅ `describe("wire connection lifecycle", ...)`
- Parameterized tests: Use `test.each()` with descriptive format strings
  - `test.each([...])("operation: %s + %s = %s", (a, b, expected) => ...)`

**Test Structure:**

- Group tests by method/feature using `describe()` blocks
- Use specific matchers: `toBe`, `toEqual`, `toBeNil`, `toHaveLength`, `toError()`
- Extract complex setup to helper functions or factory files
- One logical assertion per test (multiple expects OK if testing same concept)

## Important Files

- `src/entity/ProjectEntity.ts` - Individual entity data structure
- `src/entity/ProjectContent.ts` - Project entities collection
- `src/project/UserProject.ts` - Full project & stage definitions
- `src/ui/ProjectSettings.tsx` - Main UI component
- `src/lib/references.ts` - Global function storage system

For Factorio API documentation, prefer to inspect or grep `typed-factorio`, instead of using online documentation (`node_modules/typed-factorio/**/*.d.ts`); if normal tools to read/search don't work, use bash commands

## Docs, planning, and research

- Omit code comments and doc comments in docs. If needed, comment outside code blocks.

## Important Notes

- In commit messages, do not include claude code attribution. The user is the sole author of the changes.

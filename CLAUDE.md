## Project Overview

Staged Blueprint Planning is a Factorio mod for designing multi-stage blueprints. Written in TypeScript and compiled to Lua via TypeScriptToLua (TSTL).

## Development Commands

```bash
pnpm run build:test        # Full build (run once initially, or after clean)
pnpm run build:release     # Production build
pnpm run test              # Run tests (incremental build)
pnpm exec tstl && pnpm exec factorio-test run # decomposed pnpm run test
pnpm run test:rebuild      # Clean, rebuild, and test


pnpm exec factorio-test run "filter1" "foo%-test > block name" # Run specific test (Lua patterns: escape - as %-)

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
- Never cast to `any` or `Record<..., unknown>` or the like in new code if a more specific type is possible. Always create an explicit type; derive from existing types if applicable, add new type definition if needed.
- Do NOT use properties `get foo()`; use `getFoo(), setFoo()` instead.

### Lua

Since Typescript code compiles to Lua:

- Use `==` instead of `===`, `!=` instead of `!==`
- Use `nil` instead of `undefined`, avoid `null`

Storage:

- The `storage` table is persistent/serialized
- Mod needs to behave the same when reloaded at any point
- CANNOT serialize functions -- use instead either classes and methods with @RegisterClass, or the FuncRef system (see lib)

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
│   └── ProjectContent.ts     # Project's entities collection (observable)
├── blueprints/         # Blueprint-specific logic
├── import-export/      # Import/export to string
├── tiles/              # Tile handling
├── ui/                 # Frontend UI components
│   └── project-settings/  # Project settings tabs
├── lib/                # Core libraries
│   ├── event/          # Custom event system (Event, Property, GlobalEvent)
│   ├── factoriojsx/    # Custom JSX framework for Factorio GUI
│   ├── geometry/       # Geometry utilities
│   ├── references.ts   # Function storage system 
│   └── migration.ts    # Migration framework
├── utils/              # General utilities
├── test/               # Tests (mirrors src/ structure)
├── prototypes/         # Factorio data stage prototypes
└── control.ts          # Mod entry point
```

- `src/entity/ProjectEntity.ts` - Individual entity data structure
- `src/entity/ProjectContent.ts` - Project entities collection (observable via ContentObserver)
- `src/project/Project.ts` - Main project interface and implementation
- `src/project/actions/ProjectActions.ts` - All player action handling
- `src/project/WorldPresentation.ts` - World state sync (implements ContentObserver)
- `src/project/entity-highlights.ts` - Entity highlight visualization
- `src/lib/references.ts` - Global function storage system

#### Main Event Pipeline

in `src/project/`:

1. `event-handlers.ts` - Parses Factorio events, dispatches to actions
2. `ProjectActions` - Handles player interactions and state changes
3. `ProjectContent` (observable) - State changes notify observer
4. `WorldPresentation` (ContentObserver) - Syncs world state with project
5. `entity-highlights.ts` - Manages entity visual highlights

### Custom Libraries

**factoriojsx**: (`src/lib/factoriojsx/`): Provides JSX GUI creation for Factorio
**Event System** (`src/lib/event/`): Custom reactive event/property system
**References** (`src/lib/references.ts`): Allows registered functions to be stored in `storage`

### Migrations

**IMPORTANT**: when editing anything that ends up in the `storage` global (project data, player data, etc.), always add a migration.
See [docs/Migrations.md](docs/Migrations.md) for full reference and patterns.

- Place project-related migrations in: `src/project/index.ts`
- use `Migrations.to($CURRENT_VERSION, ...)` as a placeholder for current version. Global var will be substituted by a script later.

### Debugging

- `print()`, `localised_print()` (Factorio builtins) or `debugPrint()` (custom lib) can be added to code; output shows up in test failure output

### Testing

- Place in in `src/test/` or `src/lib/test/`
- test file names mirror source: `src/foo/bar.ts` → `src/test/foo/bar.test.ts`
- High test coverage expected
- Framework: factorio-test (Jest-like), assertions via tstl-expect
- Lifecycle hooks: `before_each`, `after_each`, `before_all`, `after_all`

**Test Structure:**

- Extract complex setup to helper functions or factory files
- One logical assertion per test (multiple expects OK if testing same concept)

## Notes

- For Factorio API documentation, prefer inspecting `node_modules/typed-factorio/**/*.d.ts` instead of online documentation.
- with `noEmitOnError`, TSTL warnings will cause no emit, possibly failing tests
- For user-visible changes, also update src/changelog.txt

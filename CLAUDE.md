## Project Overview

Staged Blueprint Planning is a Factorio mod for designing multi-stage blueprints. Written in TypeScript and compiled to Lua via TypeScriptToLua (TSTL).

## Development Commands

```bash
pnpm run build:test        # Full build (run once initially, or after clean)
pnpm run build:release     # Production build
pnpm run test              # Run tests (incremental build)
pnpm run test:rebuild      # Clean, rebuild, and test
pnpm exec factorio-test run "filter1" "foo%-test > block name" # Run specific test (Lua patterns: escape - as %-)
pnpm run format:fix        # Prettier
pnpm run lint              # ESLint
pnpm run check             # Full validation (format, lint, test, git tree clean)
```

Run format and lint after changes.

## Code Style

- No semicolons, 120 char line width
- Explicit member accessibility
- Explicit module boundary types
- Test files end with `.test.ts`
- Never cast to `any`, `Record<..., unknown>`, or similar in new code. Always create an explicit type; derive from existing types if applicable, add type definition if needed.
- Do NOT use properties `get foo()`; use `getFoo(), setFoo()` instead.

### Lua

Since Typescript code compiles to Lua:

- Use `==` instead of `===`, `!=` instead of `!==`
- Use `nil` instead of `undefined`, avoid `null`. `nil` is a global; do not import it
- Exported `let` variables are captured by value at require-time. For cross-module mutable state, use getter functions instead of direct exports

### Storage

- The `storage` table is persistent/serialized
- Mod needs to behave the same when reloaded at any point
- CANNOT serialize functions -- use instead either classes and methods with @RegisterClass, or the FuncRef system (see lib)

### Imports

- Circular imports will lead to lua stack overflow. Type-only imports are exempt.

## Architecture

```
src/
├── project/            # Main backend: project state & logic
│   ├── event-handlers/ # Parses Factorio events → ProjectActions → ProjectContent → WorldPresentation
│   └── actions/        # Player action handling
├── entity/             # ProjectEntity (data) + ProjectContent (observable collection)
├── blueprints/         # Blueprint-specific logic
├── ui/                 # Frontend UI (factoriojsx framework)
├── lib/                # event/, factoriojsx/, geometry/, references.ts, migration.ts
├── test/               # Mirrors src/ structure
└── control.ts          # Mod entry point
```

### Migrations

**IMPORTANT**: when editing anything that ends up in the `storage` global (project data, player data, etc.), always add a migration.
See [docs/Migrations.md](docs/Migrations.md) for full reference and patterns.

- Place project-related migrations in: `src/project/index.ts`
- use the global var `$CURRENT_VERSION` (`Migrations.to($CURRENT_VERSION, ...)` as a placeholder. Global var will be substituted by a script later.

### Debugging

- `print()`, `localised_print()`, `debugPrint()` output shows in test failure output (use `--verbose` for passing tests)
- `log()` prints to Factorio log file and test output

### Testing

- Framework: factorio-test, assertions via tstl-expect (Jest-like)
- Test files mirror source: `src/foo/bar.ts` → `src/test/foo/bar.test.ts`. Update test paths when renaming source files
- High test coverage expected

## Research

When investigating something non-trivial (multi-file analysis, web research, evaluations), write findings to `_research/<descriptive-name>.md`. Include frontmatter:

    ---
    summary: "one-line description of what was investigated"
    date: YYYY-MM-DD
    tags: [relevant, tags]
    ---

Check `_research/` for existing findings before starting new investigations.

## Notes

- For Factorio API documentation, prefer inspecting `node_modules/typed-factorio/**/*.d.ts` instead of online documentation.
- with `noEmitOnError`, TSTL warnings will cause no emit, possibly failing tests
- For user-visible changes, also update src/changelog.txt

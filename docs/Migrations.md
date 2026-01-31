# Storage Migrations

When updating data structures in Factorio's `storage` global, a migration transforms existing save data to the new format. Migrations are defined using the `Migrations` namespace from `src/lib/migration.ts`. Metatables from `@RegisterClass` are restored before migrations run, so stored objects already have their methods available.

## API

| Method                                     | Description                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `Migrations.to(version, func)`             | Runs when upgrading from a version earlier than `version` (priority 9)    |
| `Migrations.early(version, func)`          | Same as `to()` but runs first (priority 8)                                |
| `Migrations.priority(prio, version, func)` | Custom priority (lower = earlier)                                         |
| `Migrations.since(version, func)`          | Runs on both `on_init` (new installs) and migration from earlier versions |
| `Migrations.fromAny(func)`                 | Runs on every version upgrade (used for GUI cleanup/refresh)              |

Use `Migrations.to($CURRENT_VERSION, ...)` as the version placeholder; a build script substitutes the real version from `src/info.json`. Sorted by `(priority, version, registrationOrder)`.

## Metatables

`@RegisterClass(name)` calls `script.register_metatable(name, prototype)`, which tells Factorio to restore metatables on deserialized objects before `on_configuration_changed` fires.
Registration names (e.g. `"Assembly"` for `UserProjectImpl`) are stable identifiers — if a name changes, Factorio won't restore the metatable automatically. Prefer not to change if not needed.
If needed, use an `early()` migration to call `setmetatable(obj, Foo.prototype)` manually so that subsequent migrations can call methods on the object.

## Placement

- Project data: `src/project/index.ts`
- GUI cleanup: UI files (`src/ui/*.ts`, `src/lib/factoriojsx/render.ts`) using `fromAny`
- Otherwise: next to related code

## Pattern: Old Interface Cast

Define an interface representing the old data shape, then cast stored objects for type-safe access during transformation:

```typescript
Migrations.to("2.4.0", () => {
  interface OldStage {
    stageBlueprintSettings?: BlueprintSettingsOverrideTable
  }
  for (const project of getAllProjects()) {
    for (const stage of project.getAllStages()) {
      const oldStage = stage as unknown as OldStage
      assume<Mutable<Stage>>(stage)
      stage.blueprintOverrideSettings = oldStage.stageBlueprintSettings!
      delete oldStage.stageBlueprintSettings
      stage.stageBlueprintSettings = createStageBlueprintSettingsTable()
    }
  }
})
```

When adding fields whose type is a registered class (e.g. `MutableProperty`), construct with `new` or the appropriate factory so it gets the correct metatable.

## When Migrations Are NOT Needed

Migrations are only needed when stored **data shape** changes. They are not needed for:

- Adding, removing, or renaming methods on registered classes (metatables point to the live prototype)
- Changing function implementations (references resolve by name)
- GUI structure changes (use `Migrations.fromAny` for cleanup instead)

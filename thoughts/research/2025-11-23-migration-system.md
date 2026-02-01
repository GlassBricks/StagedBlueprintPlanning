---
date: 2025-11-23T17:23:24-06:00
git_commit: 8dcb4a58808404dcfb2db59e6f95853792e6050b
branch: main
repository: StagedBlueprintPlanning
topic: "How is migration handled in this codebase? When is migration needed?"
tags: [research, codebase, migration, storage, versioning]
status: complete
last_updated: 2025-11-23
---

# Research: Migration System in Staged Blueprint Planning

**Date**: 2025-11-23T17:23:24-06:00
**Git Commit**: 8dcb4a58808404dcfb2db59e6f95853792e6050b
**Branch**: main
**Repository**: StagedBlueprintPlanning

## Research Question

How is migration handled in this codebase? When is migration needed?

## Summary

This codebase uses a custom migration framework (`src/lib/migration.ts`) that hooks into Factorio's `on_configuration_changed` event to execute versioned migrations when the mod is updated. Migrations are needed whenever the structure of global `storage` changes, requiring data transformation to maintain compatibility with save files from previous versions.

The migration system supports:

- Version-specific migrations (`Migrations.to()`, `Migrations.early()`)
- Priority-based execution ordering
- Migrations that run on any version change (`Migrations.fromAny()`)
- Migrations that run on both new installs and upgrades (`Migrations.since()`)
- A special `$CURRENT_VERSION` placeholder for current-version migrations

Migrations are registered during module load time and executed in sorted order (by priority, then version, then registration order) when the mod version changes.

## Detailed Findings

### Migration Framework

The core migration framework is located in [src/lib/migration.ts](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts).

#### Registration API

**`Migrations.to(version, func)`** ([src/lib/migration.ts:36-42](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L36-L42))

- Runs when migrating from a version earlier than specified
- Priority: 9 (normal)
- Used for most data migrations

**`Migrations.early(version, func)`** ([src/lib/migration.ts:44-50](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L44-L50))

- Same as `to()` but runs before normal migrations
- Priority: 8

**`Migrations.priority(prio, version, func)`** ([src/lib/migration.ts:53-59](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L53-L59))

- Allows custom priority specification
- Lower priority numbers run first

**`Migrations.since(version, func)`** ([src/lib/migration.ts:63-65](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L63-L65))

- Runs both during `on_init` (new installs) and as migration from earlier versions
- Used instead of on_init, so both new installs and upgraded installs reach same state

**`Migrations.fromAny(func)`** ([src/lib/migration.ts:69-71](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L69-L71))

- Runs during ANY migration from an earlier version
- Uses current mod version from `script.active_mods[script.mod_name]`
- Useful for GUI cleanup and refresh operations

#### Execution Flow

1. **Registration Phase** (module load time)
   - Migration functions are registered to a module-level array ([src/lib/migration.ts:33](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L33))

2. **Trigger Phase** (when mod updates)
   - Factorio raises `on_configuration_changed` event
   - Main handler in [src/control.ts:26-38](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/control.ts#L26-L38) checks for mod version change
   - Calls `Migrations.doMigrations(oldVersion)`

3. **Execution Phase** ([src/lib/migration.ts:78-86](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/migration.ts#L78-L86))
   - Filters migrations where `oldVersion < migration.version`
   - Sorts by priority (ascending), then version, then registration order
   - Executes each migration function in sorted order

### Migration Locations

**UI Migrations**:

- [src/ui/index.ts:20-38](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/ui/index.ts#L20-L38) - GUI cleanup and margin fixes
- [src/ui/mod-button.tsx:123-129](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/ui/mod-button.tsx#L123-L129) - Mod button recreation
- [src/ui/ProjectSettings.tsx](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/ui/ProjectSettings.tsx) - Project refresh
- [src/ui/opened-entity.tsx](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/ui/opened-entity.tsx) - Entity UI cleanup

**System Migrations**:

- [src/project/undo.ts:166-172](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/project/undo.ts#L166-L172) - Cleanup using `$CURRENT_VERSION`
- [src/lib/factoriojsx/render.ts](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/factoriojsx/render.ts) - GUI element cleanup
- [src/lib/player-init.ts](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/lib/player-init.ts) - Player initialization

### When Migrations Are Needed

Migrations are required when:

1. **Renaming, changing, or removing storage fields** [src/project/index.ts]
   - Example rename: `stageBlueprintSettings` → `blueprintOverrideSettings`
   - Example format change: Numeric keys (1, 2, 3, 4) → String keys ("icon1", "icon2", etc.)
   - Example: Deleting old numeric icon keys

2. **Updating existing data to new constraints**
   - Modify existing objects to meet new rules

3. **GUI structure changes** [src/ui/index.ts:20-28](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/ui/index.ts#L20-L28))
   - Clean up and recreate UI elements
   - Prevents crashes from incompatible GUI structures

Migrations are NOT needed when:

1. **Adding optional fields** - Use `?` and lazy initialization
2. **Adding new PlayerData fields** - Use `onPlayerInit()` or `onPlayerInitSince()`
3. **Adding new storage fields** - Initialize in `Events.on_init()`
4. **Read-only changes** - No data structure modifications

### $CURRENT_VERSION Placeholder

The `$CURRENT_VERSION` is a special placeholder that gets substituted during the publishing process.

**Declaration** ([src/control.ts:10-14](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/control.ts#L10-L14)):

```typescript
/** @beforeImports */
{
  $CURRENT_VERSION = script.active_mods[script.mod_name]!
}
declare global {
  let $CURRENT_VERSION: VersionString
}
```

**Usage** ([src/project/undo.ts:166](https://github.com/GlassBricks/StagedBlueprintPlanning/blob/8dcb4a58808404dcfb2db59e6f95853792e6050b/src/project/undo.ts#L166)):

```typescript
Migrations.to($CURRENT_VERSION, () => {
  delete storage.futureUndoData
})
```

**Substitution Process** [scripts/subst-current-version.ts]

- Runs during `prepublish` hook in [src/info.json:22]
- Reads version from [src/info.json:3]
- Replaces all `$CURRENT_VERSION` occurrences with actual version string
- Automatically stages changed files with git

This allows developers to write migrations tied to the current version without hardcoding version numbers.

## Code References

- [src/lib/migration.ts] - Migration framework
- [src/project/index.ts:28-180] - Project data migrations
- [src/control.ts:26-38] - Migration trigger handler
- [src/lib/players.d.ts] - Base storage pattern
- [scripts/subst-current-version.ts] - Version substitution
- [src/lib/test/migration.test.ts] - Migration tests

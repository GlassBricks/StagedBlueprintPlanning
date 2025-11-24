---
date: 2025-11-23T17:46:22-06:00
researcher: GlassBricks
git_commit: 99bf9c8713645d2a47e39dfbde56a5d270d672e0
branch: better-bp-paste
repository: StagedBlueprintPlanning
topic: "What is bplib and how does it work"
tags: [research, bplib, blueprints, external-library]
status: complete
last_updated: 2025-11-23
last_updated_by: GlassBricks
---

# Research: What is bplib and how does it work

**Date**: 2025-11-23T17:46:22-06:00
**Researcher**: GlassBricks
**Git Commit**: 99bf9c8713645d2a47e39dfbde56a5d270d672e0
**Branch**: better-bp-paste
**Repository**: StagedBlueprintPlanning

## Research Question

What is bplib and how does it work? How is it currently integrated (or planned to be integrated) in this project?

## Summary

**bplib** is a third-party Blueprint Manipulation Library for Factorio 2.0, developed by the project-cybersyn team. It provides abstraction layers and helper functions for programmatically manipulating blueprints, particularly for:

1. **Unified blueprint access** - Single API regardless of blueprint location (inventory, book, library)
2. **Tag management** - Easy storage/retrieval of custom entity data via blueprint tags
3. **Overlap detection** - Automatic detection of blueprint entities placed over existing world entities
4. **Coordinate transformation** - Handles rotation, flipping, position mapping between blueprint/world space
5. **Custom snapping** - Extensible snapping system for precise entity placement

**Current status in this project**: Type declarations exist (`src/declarations/bplib.d.ts`) but bplib is **not actively used**.

## Detailed Findings

### What is bplib?

**Source**: [GitHub Repository - project-cybersyn/bplib](https://github.com/project-cybersyn/bplib)

bplib is a utility library for Factorio 2.0 mod developers who need to programmatically manipulate blueprints. It solves four primary pain points:

1. **Unified blueprint handling** - Abstracts over blueprints whether they're within or without books, in the library, in the inventory, etc.
2. **Entity overlap management** - Correctly identifies and updates pre-existing entities when an overlapping blueprint is stamped down
3. **Blueprint tag extraction** - Correctly extracts blueprint tags from world entities into blueprints, including when blueprints are updated via "select new contents"
4. **Advanced compatibility** - Supports absolute and relative snapping, offsets, books, libraries, and other complexities

**Repository Details**:

- **License**: MIT
- **Current Version**: 1.1.7
- **Language**: 100% Lua
- **Mod Portal**: [https://mods.factorio.com/mod/bplib](https://mods.factorio.com/mod/bplib)

### Core API Components

#### Main Module: `__bplib__/blueprint`

The primary API provides three main exports:

1. **`get_actual_blueprint(player, record?, stack?)`**
   - Returns the actual blueprint stripped of containing books
   - Accepts either a `LuaRecord` or `LuaItemStack` (record preferred)
   - Returns `bplib.Blueprintish?` (union of `LuaItemStack|LuaRecord`)

2. **`BlueprintSetup` Class** - For blueprint creation/setup phase
3. **`BlueprintBuild` Class** - For blueprint placement/build phase

#### BlueprintBase Interface

Base class providing common blueprint manipulation interfaces:

**Properties**:

- `record?`: LuaRecord being manipulated
- `stack?`: LuaItemStack being manipulated
- `player`: LuaPlayer performing manipulation
- `actual?`: Blueprintish stripped of books
- `entities?`: BlueprintEntity[] array
- `bpspace_bbox?`: BoundingBox in blueprint space
- `snap?`: TilePosition grid size
- `snap_offset?`: TilePosition grid offset
- `snap_absolute?`: boolean for absolute/relative snapping
- `debug?`: boolean for LuaRendering graphics

**Methods**:

- `get_actual()` - Retrieves the actual blueprint, caching snap settings
- `get_entities(force?)` - Returns stored entities, optionally forcing refetch
- `get_bpspace_bbox()` - Returns bounding box in blueprint coordinate space

#### BlueprintSetup Class

**Purpose**: Temporary object for capturing entity metadata into blueprints during `on_player_setup_blueprint` event

**Constructor**:

- `BlueprintSetup:new(setup_event)` - Creates instance from `EventData.on_player_setup_blueprint`
- Returns `nil` if event doesn't contain a valid blueprint

**Methods**:

- `map_blueprint_indices_to_world_entities()` - Returns map from blueprint entity indices to real-world entities being blueprinted
- `set_tags(bp_entity_index, tags?)` - Sets or clears all tags on blueprint entity (passing nil removes all tags)
- `apply_tags(bp_entity_index, tags)` - Merges tags into existing blueprint entity tags
- `apply_tag(bp_entity_index, key, value)` - Sets single tag on blueprint entity

#### BlueprintBuild Class

**Purpose**: Temporary object for managing blueprint placement during `on_pre_build` event

**Additional Properties** (beyond BlueprintBase):

- `surface`: LuaSurface where blueprint deploys
- `position`: MapPosition of placement
- `direction`: defines.direction rotation
- `flip_horizontal?`: boolean
- `flip_vertical?`: boolean

**Constructor**:

- `BlueprintBuild:new(pre_build_event)` - Creates instance from `EventData.on_pre_build`
- Returns `nil` if not building a blueprint

**Methods**:

- `map_blueprint_indices_to_world_positions()` - Maps blueprint entity indices to worldspace positions after placement
- `map_blueprint_indices_to_overlapping_entities(entity_filter?)` - Returns map of blueprint indices to world entities that would overlap, with optional filter function

### Typical Usage Pattern

**Source**: [doc/example.lua](https://github.com/project-cybersyn/bplib/blob/main/doc/example.lua)

The typical usage follows a two-phase pattern:

**Phase 1: Blueprint Setup (Capture)**

```lua
local bplib = require("__bplib__.blueprint")
local BlueprintSetup = bplib.BlueprintSetup

script.on_event(defines.events.on_player_setup_blueprint, function(event)
    local bp_setup = BlueprintSetup:new(event)
    if not bp_setup then return end

    local map = bp_setup:map_blueprint_indices_to_world_entities()
    if not map then return end

    for bp_index, entity in pairs(map) do
        if entity.name == "my-custom-entity" then
            bp_setup:apply_tags(bp_index, { custom_data = "value" })
        end
    end
end)
```

**Phase 2: Blueprint Build (Apply)**

```lua
local BlueprintBuild = bplib.BlueprintBuild

script.on_event(defines.events.on_pre_build, function(event)
    local bp_build = BlueprintBuild:new(event)
    if not bp_build then return end

    local overlap_map = bp_build:map_blueprint_indices_to_overlapping_entities(
        function(bp_entity) return bp_entity.name == "my-custom-entity" end
    )
    if not overlap_map or not next(overlap_map) then return end

    local bp_entities = bp_build:get_entities()
    for bp_index, entity in pairs(overlap_map) do
        local tags = bp_entities[bp_index].tags or {}
        -- Apply tags to existing entity
    end
end)
```

### Advanced Features

#### Custom Entity Snapping System

**Source**: [snap.lua](https://github.com/project-cybersyn/bplib/blob/main/snap.lua)

bplib includes a sophisticated snapping system for cursor alignment during relative blueprint placement. The system supports six snap types:

1. **GRID_POINT** - Snap to nearest integer grid coordinate
2. **TILE** - Snap to tile center (offset by 0.5)
3. **EVEN_GRID_POINT** - Snap to even integer coordinates
4. **EVEN_TILE** - Snap to even tile centers
5. **ODD_GRID_POINT** - Snap to odd integer coordinates
6. **ODD_TILE** - Snap to odd tile centers

The system handles rotation, parity-based alignment, and coordinate transformations automatically.

#### Remote Interface for Custom Entities

**Source**: [control.lua](https://github.com/project-cybersyn/bplib/blob/main/control.lua)

bplib exposes a remote interface allowing other mods to register custom entity snap data:

```lua
-- Register snap data by entity type
remote.call("bplib", "set_custom_entity_type", entity_type_name, snap_data)

-- Register snap data by entity name
remote.call("bplib", "set_custom_entity_name", entity_name, snap_data)

-- Retrieve registered data
remote.call("bplib", "get_custom_entity_types")
remote.call("bplib", "get_custom_entity_names")
```

**Snap Data Format**:

- Array of 4-6 numbers: `[left, top, right, bottom, x_parity?, y_parity?]`
- Positions 1-4: Offsets from entity center to bbox edges
- Positions 5-6: Optional 2x2 snapping parity (1 for odd, 2 for even, nil to disable)

### Type System

**Source**: [types.lua](https://github.com/project-cybersyn/bplib/blob/main/types.lua)

The library is fully typed with LuaLS annotations:

- **`bplib.Blueprintish`** - Union type: `LuaItemStack|LuaRecord`
- **`bplib.SnapData`** - Array defining entity bounding box and grid alignment
- **`bplib.DirectionalSnapData`** - Maps directions to snap configurations
- **`bplib.EntityDirectionalSnapData`** - Maps entity names/types to directional data

## Current Integration in This Project

### Type Declarations

**Location**: `src/declarations/bplib.d.ts`

This project includes complete TypeScript type declarations for bplib modules:

**Module 1: `__bplib__/types`** (Lines 2-19)

- `Blueprintish` - Union of `LuaItemStack | LuaRecord`
- `SnapData` - Tuple type for snap data `[left, top, right, bottom, x_parity?, y_parity?]`
- `DirectionalSnapData` - Record mapping directions to snap data
- `EntityDirectionalSnapData` - Record mapping entity names to directional snap data

**Module 2: `__bplib__/blueprint`** (Lines 22-93)

- Complete TypeScript interfaces for `BlueprintBase`, `BlueprintSetup`, `BlueprintBuild`
- Constructor interfaces for both classes
- Function signature for `get_actual_blueprint`

Both modules are marked with `@noResolution` directive to prevent TypeScript from trying to resolve these modules (they're Lua modules loaded at runtime).

## Code References

- `src/declarations/bplib.d.ts:1-93` - Complete bplib type declarations
- `src/project/event-handlers.ts:335-378` - Current `on_pre_build` event handler
- `src/project/event-handlers.ts:570-608` - Blueprint preparation with marker injection
- `src/project/event-handlers.ts:619-647` - Blueprint paste state tracking
- `src/project/event-handlers.ts:723-855` - Entity marker handler implementation
- `src/project/event-handlers.ts:610-617` - Blueprint reversion logic

## External Resources

- [GitHub Repository - project-cybersyn/bplib](https://github.com/project-cybersyn/bplib)
- [Factorio Mods Portal - bplib](https://mods.factorio.com/mod/bplib)
- [README.md](https://github.com/project-cybersyn/bplib/blob/main/README.md)
- [blueprint.lua - Main API](https://github.com/project-cybersyn/bplib/blob/main/blueprint.lua)
- [doc/example.lua - Usage Example](https://github.com/project-cybersyn/bplib/blob/main/doc/example.lua)
- [types.lua - Type Definitions](https://github.com/project-cybersyn/bplib/blob/main/types.lua)
- [control.lua - Remote Interface](https://github.com/project-cybersyn/bplib/blob/main/control.lua)
- [snap.lua - Snapping System](https://github.com/project-cybersyn/bplib/blob/main/snap.lua)
- [changelog.txt - Version History](https://github.com/project-cybersyn/bplib/blob/main/changelog.txt)

## Key Takeaways

1. **bplib is a production-ready library** - MIT licensed, fully typed, actively maintained by project-cybersyn
2. **Solves blueprint manipulation pain points** - Unified access, overlap detection, tag management, coordinate transformation
3. **Two-phase API design** - `BlueprintSetup` for capture, `BlueprintBuild` for placement

## Related Research

- `thoughts/shared/research/2025-11-23-blueprint-paste-event-handling.md` - Covers current implementation details

## Open Questions

1. Which approach will be chosen for migration: bplib or `on_blueprint_settings_pasted` event?
2. Is bplib's overlap detection sufficient for all use cases in this project?

# Better Surfaces and map gen settings

Improve "surfaces" and map gen settings handling in projects.

# Phases

## 0: simple changes

Make surface names match somewhat resemble project/stage names

- `stage-<surface-id>-<project-name>-<stage-name>`, after making all alphanumeric, truncating to max length

- React to project/stage change, update surface names
- try/catch to avoid crash on name collision

## 1: Better map settings

Making existing map settings explicit, instead of currently ad-hoc

```ts
interface SurfaceSettings {
  type: "surface"
  // directly get/set on LuaSurface
  map_gen_settings?: MapGenSettings // defaults to game.get_manual_settings
  generate_with_lab_tiles: bool
  ignore_surface_conditions: true
  // needs manual handling
  surface_properties?: Record<string, double> // defaults to nauvis surface properties
  has_global_electric_network: bool // needs manual "setter"
}
// default values. Make sure these align with the current defaults
const DEFAULT_SURFACE_SETTINGS: SurfaceSettings = {
  map_gen_settings: nil,
  generate_with_lab_tiles: true,
  ignore_surface_conditions: true,
  surface_properties: nil, // nauvis surface properties
  has_global_electric_network: false,
}
```

- New functions to read settings from planet/apply settings to all stages
- Update existing UI set map gen settings, set seed, to instead write settings, then apply settings to surfaces
- Include these settings (optional) in import/export

## 2: New project creation UI

Instead of instantly creating a project, present a UI.

Structure:

```
# New Project
Name: string
Initial num stages: int

## Map gen settings
Use lab tiles: bool
Planet: (dropdown of planets + None)
Seed: (number); enabled only if not using lab tiles

Global electric network: bool
```

Make the "map gen settings" UI component reusable, replacing the current "set map gen settings from planet"

Keep "Sync map gen settings".

## 3: Space platform support

Support space platforms!

- New map settings: is space platform, starter pack to use
  - Overrides planet/seed settings
    Change settings:

```ts
interface SpacePlatformSettings {
  type: "spacePlatform"
  starter_pack: NameWithQualityId
}

type MapGenSettings = SpacePlatformSettings | MapGenSettings
```

- Selectable in "map gen settings ui", disables other map settings
- Needs super custom surface creation/deletion handling.

- Make all tiles invincible in space, so can't be damaged by asteroids (???)

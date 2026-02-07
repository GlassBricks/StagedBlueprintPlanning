# Staged Blueprint Planning

The ultimate mod for designing multi-stage blueprints.

Separate your builds into stages. Edit entities in any stage, and changes will be applied to all later stages. Create a blueprint book of all stages in one click.

Thedoh has made a great video detailing the features of this mod: https://www.youtube.com/watch?v=e8XHsEVqtiY
Note some of the newer features may not be present in the video.

## Getting Started

> Note: this mod is meant to be used in editor mode or a separate planning save, not with a normal game.

Create a new project by clicking the "Staged Blueprint Projects" button in the top left.

Entities placed in a stage propagate to all later stages. Translucent previews appear in earlier stages. Entity properties can differ per-stage, editing in one stage will apply to all later stages.
Navigate between stages with `Ctrl+Scroll Wheel`, or use the stage buttons in the project settings panel.

When ready, you can export individual stage blueprints, or export get a blueprint book with one blueprint per stage.

## Editing a Project

### Entity Info Panel

An entity info panel opens when clicking an entity. Shows first stage, stages with changes, last stage; with navigation buttons to jump between them.

The ui also allows:

- Move entity to the current stage
- Per-property reset/move: revert a stage diff to the previous value, or push it down to the previous stage
- Other buttons depending on entity type and settings

Tip: enabling "show additional entity info" in editor mode allows opening this panel for preview entities too.

### Moving Entities Between Stages

There are several ways to move entities between stages:

- **Move to current stage** shortcut `[Ctrl+Alt+Middle Click]`, or use entity info panel button
- **Stage Move Tool**:
  Adjust the target with `Shift+Scroll Wheel`. There are several selections for different workflows:
  - Select / Alt-select: send entities to target stage
  - Reverse-select: bring entities to the current stage
  - Alt-reverse-select: bring entities to the current stage, but only from later stages
- **Filtered Stage Move Tool**: same as stage move tool, but with entity type filters, and only supports normal select

All move actions support undo.

### Entity Editing

- **Upgrading an entity**: to upgrade an entity, use the upgrade planner, not fast-replace.
- **Delete/rotating an entity**: deleting and rotating is only allowed in an entity's first stage. Use force delete or staged deconstruction for other cases.
- **Force Delete**: There is a shortcut `[Ctrl+Shift+Right Click]`, and a selection tool, to deletes entities regardless of stage. Supports undo
- **Editing wires**: circuit and copper cable connections are tracked, but must be the same across all stages.
- **Flipping Underground belts**: paired undergrounds rotate and upgrade together; upgrades that would break pairing are prevented. An error is shown if an underground is forced into the wrong input/output direction

### Settings remnants

If you delete an entity with special settings, this will create a "settings remnant" (white boxes). This allows restoring the data on undo.
If you want to remove these, either force delete the entity or use the **Cleanup tool**.

### Item Requests

If you add bot item requests to an entity, these will be included in exported entities (unlike vanilla behavior where non-ghost requests are lost).
Item requests only apply to the current stage, and will not be included in later stages.

Modules remain staged normally even though they are technically item requests.

### Staged Deconstruction

Staged deconstruction sets an entity's last stage, causing it to disappear from that stage onward (and from corresponding blueprints).

- Select: set last stage to current stage
- Reverse-select: set last stage to the _next_ stage
- Alt-select: cancel (remove last stage)
- A per-player setting swaps normal select and reverse-select behavior, if you prefer the reverse behavior.

Deconstruction can also be cancelled in the entity info panel.

### Staged Copy/Cut

Copy `[Ctrl+Shift+C]` or cut `[Ctrl+Shift+X]` entities with stage diffs, wires, and item requests preserved. Pasting restores all stage data.

A toggle keybind switches between vanilla and staged copy/cut while holding the tool.
The resulting blueprints can also be exported to strings and shared between saves; however, stage data will be referenced by their absolute position in project, not by name.

### Overlapping entities

If entities overlap or can not be placed, an error highlight is shown.
Use the **cleanup tool** on these will to attempt fixing errors, and reverse selecting with the cleanup tool will _delete_ errored entities.

### Blueprint Exclusion Tool

This tool allows marks individual entities as excluded from blueprints, per-stage, per-entity. Alt-select removes the exclusion.

### Vehicles and Trains

Trains and vehicles exist in a _single stage only_.
Vehicles can be repositioned; use the entity info panel to reset the vehicle location, or save the current position. Connected trains are moved as a whole unit.

### Tiles

Staged tiles are optionally supported, to track tile changes across stages like entities.

An alternative is to use **tile filling**, which allows filling tiles with lab tiles, a selected "landfill" tile, or combinations (tile+lab, tile+water)
See in-game tooltips for full details on each option.

## Blueprints

Blueprint settings and exporting is configured in the Blueprints tab of the project settings panel.

### Blueprint Settings

Most blueprint settings can be configured either as a **Defaults** or a **per-stage overrides**.

Grid size, and grid position, is configured configured by editing a blueprint. This will be applied/synced to all stages such that the grid cursor is at the same location.

See per-setting tooltips for full details.

### Exporting Blueprints

Blueprints can be exported as a single stage, or as a blueprint book.

The blueprint book defaults to a single blueprint per stage. You can also create a **Blueprint book template** to customize layout, nesting, and add other items to the book (e.g. upgrade planners).

## Importing and Exporting Projects

Projects can be imported/exported as a shareable string. It is exported in the "Blueprints" tab, and imported in the main project list GUI opened by upper left button.

## Map Generation Settings

Custom pap generation settings (such as planet settings, or set-seed) can be specified at project creation. See the in-game UI for full details.

If the space age mod is enabled, **space platforms** projects are also supported.

## Troubleshooting

If you run into issues or inconsistencies, try one of:

- **Resync with world**: reads all entities from the world, and updates the saved state to match.
- **Rebuild stage / rebuild all stages**: _rebuilds_ entire world state from stored project data. However, this means any buggily unsaved entities will be lost!
- `/clean-broken-entities` command: will removes entities with missing world state. If you have many things that just can't be deleted, try using this command.

If the issue is persistent, please report it on GitHub!

## Feedback

Any comments, criticisms, and suggestions are greatly appreciated!

You can contact me (GlassBricks) on the AntiElitz speedrunning discord, or use the mod portal forums.

If you like what you see, consider supporting me on Ko-fi!

[![Buy Me a Coffee at ko-fi.com](https://storage.ko-fi.com/cdn/kofi2.png?v=3)](https://ko-fi.com/Z8Z1VI6P8)

## Acknowledgements

Gallery images are from AntiElitz's older 100% blueprints.

Thanks to the [Factorio speedrunning community](https://discord.gg/AntiElitz) and [Warger](https://discord.com/invite/nfkbu6qSCj) for providing inspiration and feedback for this mod. As such, this mod is A.K.A. the Nefrums-approved anti-anti-Anti-tool.

This mod was partly inspired by [Blueprint Stages](https://mods.factorio.com/mod/blueprint-stages).

# Staged Blueprint Planning

The ultimate mod for designing multi-stage blueprints. A.K.A. the Nefrums-approved anti-anti-Anti-tool.

Separate your builds into stages. Edit entities in any stage, and changes will automatically be applied to all later stages. Create a blueprint book of all stages in one click.

This mod is in active development (new features are still being added!) Feedback is greatly appreciated.

## Basic usage

Create a new staged build by clicking the "Staged Builds" button in the top left.

Move between stages using the settings window or the navigation shortcuts (see below).

When you make build or edit entities, the changes will be applied to the current and _later_ stages.

You can automatically create blueprints via the "Blueprints" tab of the settings window.

Use the navigation controls! These are (with default keybindings):

- `[CTRL+Mouse wheel]` to move between stages
- `[CTRL+Middle mouse button]` to cycle between notable stages of the hovered entity (where the entity is different from the previous stage)
- `[CTRL+SHIFT+Middle mouse button]` to teleport to the first stage of the hovered entity (or preview)
- `[CTRL+ALT+Middle mouse button]` to move an entity to the current stage

## More details!

### Editing

Building, mining, rotating, fast-replacing, copper/circuit wires, configuration changing, blueprints/deconstruction planner/upgrade planner, moving entities with [Picker Dollies](https://mods.factorio.com/mod/PickerDollies), are all supported. If there is some interaction that is not handled, please submit a bug report!

Preview entities will be shown for entities in previous stages. If you're in editor mode, you can open preview entities to view their info.

### Changing entity settings, upgrading entities

If you change the settings of an entity, those changes will be applied to _later_ stages only. The entity will be highlighted in blue to indicate the entity has been changed, and a blueprint indicator sprite will appear at lower stages.

To _upgrade_ an entity, you must use the _upgrade planner_ (instead of fast-replace). This will also highlight the entity.

Copper/circuit wire changes between stages aren't supported; instead, they're always present in all stages.
To mitigate this, if you connect a new wire to an inserter or belt, in previous stages the control behavior will be set to "no control".

### Deleting/rotating entities

Deleting or rotating an entity is normally only allowed in the entity's _first stage_.

To explicitly delete an entity from later stages, use the Stage Deconstruction Tool (found in the shortcut menu, just right of the quick-bar).

- When an entity has been stage-deconstructed, an indicator sprite will appear in the next-to-last stage.
- Alt-select (select for deconstruction cancellation) in the previous stage to remove the deconstruction.

Note: trains are by default only in 1 stage (set to be deconstructed in the next stage)

### Moving entities between stages

There is a hotkey control for moving an entity to the current stage. This can be done on entities or previews.

There is also a Stage move tool to facilitate moving multiple entities between stages. This can be accessed in the shortcuts menu (just right of the quick-bar):

- Use `Shift + scroll wheel` (default keybinding) to change the target stage.
- Selecting entities will move entities in the _current_ stage to the target stage.
- Alt/Reverse selecting with the tool will move entities from _any_ stage to the current stage.

All these actions are compatible with undo!

### Upgrade on blueprint paste

There is a user mod setting to "Allow blueprint pasting to upgrade entities". When set to true, when pasting a blueprint entity overlapping a compatible entity, the entity will be upgraded (this is different from vanilla behavior).

### Settings remnants

If an entity with stage changes is deleted, a "settings remnant" is left behind (white outline).
If you then undo, those settings will be restored.

To remove settings remnants, use the `Staged Build Cleanup Tool` (accessed in the shortcuts menu, right of the quick-bar).

Note: this may become obsolete in the near future!

### Cleanup tool

Using the build cleanup tool will remove "settings remnants", and attempt to revive any errored entities.

Reverse-selecting using the cleanup tool will **force delete** errored entities.

### Landfill/tiles

Landfill can be automatically placed in your blueprints. See the "Stage" tab in the settings gui for more details.

The "Flexible Offshore Pump Placement" _startup setting_ enables placing offshore pumps in places not usually allowed. This may be useful in designing blueprints with offshore pumps, and is enabled by default.

More complete tiles support may come in the future.

### Blueprints

The "Blueprints" tab provides many settings for blueprint exporting.

Editing the "Default" settings will affect blueprints in all stages.
The settings can be overridden for individual stages in the "Current stage" tab.
Overriden settings are highlighted in green.

See the tooltips for more information.

### Footgun removal

If an entity overlaps with another in a higher stage, a red outline will appear where the entity should be, and a warning indicator will appear in all other stages. Use the `Staged Build Cleanup Tool` to attempt to revive these.

Rotating/upgrading an underground will affect its paired underground, in any stage.

If there are inconsistencies in underground directions due to being flipped by a pair underground, these will be highlighted in red.

## Feedback

Any comments, criticisms, and suggestions are greatly appreciated!

You can contact me (GlassBricks) on the AntiElitz speedrunning discord, or use the mod portal forums.

## Acknowledgements

Gallery images from Nefrums's recent 100% run blueprints (on speedrun.com). They are also outdated...

Thanks to the [AntiElitz factorio speedrunning community](https://discord.gg/AntiElitz) and [Warger](https://discord.com/invite/nfkbu6qSCj) for providing inspiration and feedback for this mod.

This mod was inspired by [Blueprint Stages](https://mods.factorio.com/mod/blueprint-stages).

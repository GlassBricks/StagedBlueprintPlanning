# Staged Blueprint Planning

The ultimate mod for designing staged blueprints, e.g. for 100% speedruns. A.K.A the Nefrums-approved anti-anti-anti-tool.

Separate your builds into stages. Edit entities in any stage, and changes will automatically be applied to all later stages. Create a blueprint book of all stages in one click.

This mod is in active development (new features are still being added!) Feedback is greatly appreciated.

## Basic usage

Create a new staged build by clicking the "Staged Builds" button in the top left.

Move between stages using the settings window, or the navigation shortcuts (see below).

When you make a change, that change will be applied to the current and _later_ stages.
Every game interaction should be handled. (If this is not the case, please submit a bug report!)

You can automatically create blueprints/a blueprint book via the "Blueprints" tab of the settings window.

See below for complete details.

Use the navigation controls! These are (with default keybindings):

- `[CTRL+Mouse wheel]` to move between stages
- `[CTRL+Middle mouse button]` to cycle between notable stages of the hovered entity (where the entity is different from the previous stage)
- `[CTRL+SHIFT+Middle mouse button]` to teleport to the first stage of the hovered entity (or preview)
- `[CTRL+ALT+Middle mouse button]` to move an entity to the current stage

## Full details

### Editing

Building, mining, rotating, fast-replacing, copper/circuit wires, configuration changing, blueprints/deconstruction planner/upgrade planner, moving entities with [Picker Dollies](https://mods.factorio.com/mod/PickerDollies), are all supported. If there is some interaction that is not handled, please submit a bug report!

Deleting or rotating an entity is only allowed in the _first stage_ (as those changes cannot be blueprinted between stages).

Trains are treated specially; they are only present in one stage (as you usually do not re-paste trains).
Trains can move from their original position, use the entity stage info gui to reset or update their position.

Preview entities will be shown for each entity in lower stages. If you are in editor mode, you can open them to view the stage info gui.

If an entity cannot be created in a stage for any reason, an error indicator will be shown at all stages.

### Stage move tool

In the bottom right (shortcuts menu), you can access the stage move tool.

Use (default keybinding) `Shift + Scroll wheel` to change the target stage.

- Selecting entities will move entities in the _current_ stage to the target stage.
- Alt/Reverse selecting with the tool will move entities from _any_ stage to the current stage.

### Changes between stages

Changing the configuration of an entity between stages is supported. When this is done, the entity will be highlighted in blue, and a blueprint sprite indicator will appear in lower stages.
Similarly, by using the _upgrade planner_, entities can be upgraded. A green highlight and upgrade planner sprite will appear in all lower stages.

Copper/circuit wire changes _between_ stages are not supported; instead they are always present in all stages.

### Landfill/tiles

Landfill can be automatically placed in your blueprints. See the settings gui for more details.
As of now, this is the only way tiles are supported.

Additionally, the "Flexible Offshore Pump Placement" startup setting enables placing offshore pumps in places not usually allowed. This may be useful in designing blueprints with offshore pumps, and is enabled by default.

### Blueprints

The "Blueprints" tab provides several options for creating blueprints. Read the tooltips for more details.

The "Make Blueprint Book" button will create a blueprint book of all stages in the current build.

### Accidental data loss prevention

If an entity with stage changes is deleted, a "settings remnant" is left behind (white outline). If you undo the deletion, those settings will be restored. This is so you don't lose data if you accidentally deleted it.
To remove settings remnants, use the `Staged Build Cleanup Tool` (shortcut, in the bottom right).

### Footgun removal

If an entity overlaps with another in a higher stage, a red outline will appear where the entity should be, and a warning indicator will appear in all other stages. Use the `Staged Build Cleanup Tool` to attempt to revive these.

Rotating/upgrading an underground will also affect its paired underground, in any stage.

It is not possible to upgrade an underground if that will change which underground it pairs with (breaking belt weaving, etc.). If this is intentional, mine and replace the underground.

Due to limitations in implementation, if an underground can possibly connect with multiple other undergrounds (e.g. an underground "cuts" another underground), it cannot be rotated/upgraded _after_ being built.

### Cleanup tool

Using the build cleanup tool will remove "settings remnants", and attempt to revive any errored entities.

Reverse-selecting using the cleanup tool will **force-delete** errored entities.

## Feedback

Any comments, criticisms, and suggestions are greatly appreciated!
Please submit these in mod portal forums.

You can also try to find me (GlassBricks) on the AntiElitz speedrunning discord.

## Possible future features

- More flexible blueprint book creation
- Handle resource entities
- Automatic analysis and basic optimization
- Import/export to string

## Acknowledgements

Gallery images from Nefrums's recent 100% run blueprints (on speedrun.com).

Thanks to the [AntiElitz factorio speedrunning community](https://discord.gg/AntiElitz), and [Warger](https://discord.com/invite/nfkbu6qSCj), who does plenty of 100% speedrunning, for providing inspiration and feedback for this mod.

This mod was inspired by [Blueprint Stages](https://mods.factorio.com/mod/blueprint-stages).

This mod is made with:

- [TypescriptToLua](https://typescripttolua.github.io/); type definitions from [typed-factorio](https://github.com/GlassBricks/typed-factorio)
- [Testorio](https://mods.factorio.com/mod/testorio), a factorio mod testing framework, used extensively for TDD

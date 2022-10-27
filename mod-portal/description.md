# 100% Blueprint Planning

The ultimate mod for designing staged blueprints for 100% speedruns. A.K.A the anti-anti-anti-tool.

Separate your builds into stages. Edit entities in any stage, and it will automatically be applied to all later stages. Create a blueprint book of your assembly in one click.

This mod is in active development (new features are still being added!) Feedback is greatly appreciated.

**Note**: high memory usage for very large blueprints, 12GB+ of RAM is recommended.

## Basic usage

Create a new assembly from clicking the "⋮" button in the "Current Assembly" window on the top.

In the "Current Assembly" window, you can see the current assembly and stage you are currently in.
Here you can also open the assembly settings.

When you make a change, that change will be applied to the current and all _later_ stages (with some exceptions, see "Changes between stages" section below).
Every game interaction _should_ be handled. If this is not so, please submit a bug report!

You can automatically create blueprints/a blueprint book of an assembly via the Assembly Settings window.

Opening an entity's gui will show an "Assembly info" window on the right, with more info/actions on a specific entity.

See below for full details on interactions.

Use the navigation controls! These are (with default keybindings):

- `[CTRL+Mouse wheel]` to move between stages
- `[CTRL+Middle mouse button]` to cycle between notable stages of the hovered entity (where the entity is different from the previous stage)
- `[CTRL+SHIFT+Middle mouse button]` to teleport to the first stage of the hovered entity (or preview)
- `[CTRL+ALT+Middle mouse button]` to move an entity to the current stage

You can turn on cyclic stage navigation using a per-player setting.

## Full details

### Editing

Building, mining, rotating, fast-replacing, copper/circuit wires, configuration changing, blueprints/deconstruction planner/upgrade planner, moving entities with [Picker Dollies](https://mods.factorio.com/mod/PickerDollies), are all supported. If there is some interaction that is not handled, please submit a bug report!

Deleting or rotating an entity is only allowed in the _first stage_ (as those changes cannot be blueprinted between stages).

Trains are treated specially; they are only present in one stage (as you usually do not re-paste trains).
Trains can move from their original position, use the Assembly info gui to reset or update their position.

Preview entities (map-view-like outlines) will be shown for each entity in lower stages. If in editor mode, you can open them to view the Assembly info gui.

If an entity cannot be created in any stage for any reason, an error indicator will be shown at all stages.

### Changes between stages

Changing the configuration of an entity between stages is supported. When this is done, the entity will be highlighted in blue, and a blueprint sprite indicator will appear in all lower stages.
Similarly, by using the _upgrade planner_ (not fast-replace), entities can be upgraded. A green highlight and upgrade planner sprite will appear in all lower stages.

Copper/circuit wire changes _between_ stages are not supported. Instead, they are always present in all stages.

This is not relevant to trains, as they only appear in one stage.

### Accidental data loss prevention

If an entity with stage changes is deleted, a "settings remnant" is left behind (white outline). If you undo the deletion, those settings will be restored. This is so you don't lose data if you accidentally deleted it.
To remove settings remnants, use the `Assembly Cleanup Tool` (shortcut, in the bottom right).

### Footgun removal

If an entity overlaps with another in a higher stage, a red outline will appear where the entity should be, and a warning indicator will appear in all other stages. Use the `Assembly Cleanup Tool` to attempt to replace these.

Rotating/upgrading an underground will also affect its paired underground, in any stage.

It is not possible to upgrade an underground if that will change which underground it pairs with (breaking belt weaving, etc.). If this is intentional, mine and replace the underground.

Due to limitations in implementation, if an underground can possibly connect with multiple other undergrounds (e.g. an underground "cuts" another underground), it cannot be rotated/upgraded _after_ being built.

### Assembly cleanup tool

Using the assembly cleanup tool will remove "settings remnants", and attempt to revive any errored entities.

Reverse-selecting using the assembly cleanup tool will **force-delete** errored entities.

### Landfill/tiles

Landfill/lab tiles can be automatically placed in your blueprints. See the Assembly/Stage settings gui for more info.

As of now, this is the only way tiles are supported.

Additionally, the "Flexible Offshore Pump Placement" startup setting enables placing offshore pumps in places not usually allowed. This may be useful in designing blueprints with offshore pumps, and is enabled by default.

### Blueprints

Using the "Get Blueprint" button in the Stage settings gui will create a blueprint of the current stage. In the "Blueprints" tab, the "Make Blueprint Book" button will create a blueprint book of the entire assembly.

The Blueprints tab also has more options for creating blueprints, such as synchronizing grid-size settings, or including the next stage's tiles in each blueprint (useful for landfill).

## Feedback

Any comments, criticisms, or suggestions are greatly appreciated!
Please submit these in mod portal forums.

You can also try to find me (GlassBricks) on the AntiElitz speedrunning discord.

## Possible future features

- A "Move to stage" tool
- Handle resource entities
- "locking" properties in stages
- Automatic analysis and basic optimization
- Import/export to string

## Acknowledgements

Gallery images from Nefrums's recent 100% run blueprints (on speedrun.com).

Thanks to the [AntiElitz factorio speedrunning community](https://discord.gg/AntiElitz), and [Warger](https://discord.com/invite/nfkbu6qSCj), who does plenty of 100% speedrunning, for providing inspiration and feedback for this mod.

This mod was inspired by [Blueprint Stages](https://mods.factorio.com/mod/blueprint-stages).

This mod is made with:

- [TypescriptToLua](https://typescripttolua.github.io/); type definitions from [typed-factorio](https://github.com/GlassBricks/typed-factorio)
- [Testorio](https://mods.factorio.com/mod/testorio), a factorio mod testing framework, used extensively for TDD

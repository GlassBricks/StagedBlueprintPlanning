# 100% Blueprint Planning

The ultimate mod for designing staged blueprints for 100% speedruns.

Separate your builds into stages. Edit entities in any stage, and it will automatically be applied to all later stages. Many interactions and features are supported.

This mod is currently in _beta_. There may be bugs or issues (hopefully not)! Feedback is greatly appreciated.

**Note**: high memory usage for very large blueprints, 12GB+ of computer ram is recommended.

## Basic usage

Create a new assembly from the "AllAssemblies" gui ("..." button in the Current Assembly window on the top left).

On the top left frame, you can see the current assembly and stage you are currently in. Here you can change stages or open the assembly settings.

When you make a change, that change will be applied to the current and all _later_ stages.
Every game interaction _should_ be handled. If this is not so, please submit a bug report!

See below for full details on interactions.

Use the navigation controls! These are (with default keybindings):

- `[CTRL+Mouse wheel]` to move between stages
- `[CTRL+Middle mouse button]` to cycle between notable stages of the hovered entity (where the entity is different from the previous stage)
- `[CTRL+SHIFT+Middle mouse button]` to teleport to the first stage of the hovered entity (or preview)
- `[CTRL+ALT+Middle mouse button]` to move an entity to the current stage

There is also the per-player setting "Use cyclic stage navigation".

## Full details

### Editing

Building, mining, rotating, fast-replacing, circuit wires, configuration changing, blueprints/deconstruction planner/upgrade planner, etc. are all supported. If there is some interaction that is not handled, please submit a bug report!

Deleting or rotating an entity is only allowed in the _first stage_ (as these changes cannot be blueprinted).

Note: currently _copper cable_ wires (not circuit wires) are not handled.

### Accidental data loss prevention

If an entity with stage changes is deleted, a "settings remnant" is left behind (white outline). If you undo the deletion, those settings will be restored. This is so you don't lose data if you accidentally deleted it.
To remove settings remnants, use the `Assembly Cleanup Tool` (shortcut, in the bottom right).

If you place an entity in the same position at a lower stage, it will be moved to the current stage, and a notification will appear. Deleting the entity again will move it back (instead of deleting it altogether). This prevents accidentally deleting entities.

### Configuration changes between stages

Changing the configuration of an entity between stages is supported. When this is done, the entity will be highlighted in blue, and a blueprint sprite indicator will appear in all lower stages.
Similarly, by using the _upgrade planner_ (not fast-replace), entities can be upgraded. A green highlight and upgrade planner sprite will appear in all lower stages.

Circuit wires changes _between_ stages are not supported. Instead, they are always present in all stages.

### Footgun removal

If an entity overlaps with another in a higher stage, a red outline will appear where the entity should be, and a warning indicator will appear in all other stages. Use the `Assembly Cleanup Tool` to attempt to replace these.

Rotating/upgrading an underground will also affect its paired underground, in any stage.

It is not possible to upgrade an underground if that will change which underground it pairs with (breaking belt weaving, etc.)

Due to limitations in implementation, if an underground can possibly connect with multiple other undergrounds (e.g. "cutting" undergrounds by building), it cannot be rotated/upgraded after built.

## Known current limitations

- Trains are not fully supported (yet).

## Feedback

Any suggestions for changing or adding features are greatly appreciated!
Please submit these in mod portal forums.

You can also try to find me (GlassBricks) on the AntiElitz speedrunning discord.

## Possible future features

- Automatic blueprint creation
- "locking" properties in stages
- Automatic analysis and basic optimization

## Acknowledgements

Gallery images from Nefrum's recent 100% runs (on speedrun.com).

Thanks to the [AntiElitz factorio speedrunning community](https://discord.gg/AntiElitz), and [Warger](https://discord.com/invite/nfkbu6qSCj), who does plenty of 100% speedrunning, for providing feedback and inspiration for this mod.

This mod was inspired by [Blueprint Stages](https://mods.factorio.com/mod/blueprint-stages).

This mod is made with:

- [TypescriptToLua](https://typescripttolua.github.io/); type definitions from [typed-factorio](https://github.com/GlassBricks/typed-factorio)
- [Testorio](https://mods.factorio.com/mod/testorio), a factorio mod testing framework, used extensively for TDD

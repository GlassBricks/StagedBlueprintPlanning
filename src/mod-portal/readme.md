# Staged Blueprint Planning

The ultimate mod for designing multi-stage blueprints. A.K.A. the Nefrums-approved anti-anti-Anti-tool.

Separate your builds into stages. Edit entities in any stage, and changes will be applied to all later stages. Create a blueprint book of all stages in one click.

## Getting started

> Note that this mod is meant to be used in editor mode or a separate planning save, not with a normal game.

Create a new staged build by clicking the "Staged Blueprint Projects" button in the top left.

Move between stages using the settings window, or the navigation shortcuts (listed below).

When you build or edit entities, the changes will be applied to the current and _later_ stages.

In the settings window, you can:

- Add, rename, or delete stages
- Create blueprints of stages (or a book for all stages)

### Controls

Here are some useful hotkeys. The default keybindings are listed in brackets.

- `[CTRL+Mouse wheel]` to move between stages
- `[CTRL+Middle mouse button]` to cycle between notable stages of the hovered entity (where the entity is different from the previous stage)
- `[CTRL+SHIFT+Middle mouse button]` to teleport to the first stage of the hovered entity (or preview)
- `[CTRL+ALT+Middle mouse button]` to move an entity to the current stage
- [CTRL+SHIFT+Right mouse button] to _force_ delete an entity (in any stage)

## More details!

Thedoh has also made a great video detailing the features of this mod in more detail. Check it out here: https://www.youtube.com/watch?v=e8XHsEVqtiY

### Changing entity settings

If you change the settings of an entity, those changes will be applied to _later_ stages.
This mirrors how blueprints can change entity settings.
The entity will be highlighted in blue to indicate it has been updated, and an indicator will appear at lower stages.

Due to technical limitations, copper/circuit wire changes between stages aren't supported; they're always present in all stages.
To mitigate this, if you connect a new wire to an inserter or belt, in previous stages the control behavior will be set to "no control".

### Upgrading entities

Upgrades are also supported: to _upgrade_ an entity, use the _upgrade planner_. This will also highlight the entity.

### Deleting entities

Deleting or rotating an entity is normally only allowed in the entity's _first stage_.

To force-delete an entity, use either the "Force delete" control (see [Controls](#Controls)), or the "Force delete" selection tool (accessed via the shortcuts menu or a custom control).

To delete an entity from _later_ stages, use the Staged Deconstruct Tool (accessed via the shortcuts menu or a custom control).
Alt-selecting (select for deconstruction cancellation) in the next-to-last stage will undo the decosntruction.

Trains are by default only in 1 stage (set to be deconstructed in the next stage).

### Moving entities between stages

You can move entities between stages using:

- A "move to current stage" control; see [Controls](#Controls).
- The "Move to current stage" button, in an entity's settings window.
- Using the stage move tool (accessed via the shortcuts menu right of the quick-bar, or via a custom shortcut).
    - Use `Shift + scroll wheel` (default keybinding) to change the target stage.
    - Select entities to move entities from the current stage to the target stage.
  - Alt-select (select for deconstruction cancellation) to move entities from _any_ stage to the target stage.
  - Reverse-select to bring entities to the _current_ stage.
  - Alternative-reverse-select to bring entities to the current stage only if they are from a later stage.

All these actions are compatible with undo!

### Entity info

You can view an entity's stage information when opening its gui.
The gui also provides a few controls for editing the entity's info; view the tooltips on the controls for more info.

If in editor mode with "show entity extra info" enabled, you can also open the gui of _preview_ entities.

### Upgrade on blueprint paste

If enabled via a user mod setting, pasting a blueprint will upgrade entities if they overlap with a compatible entity.

### Staged Copy/Paste

Use either the dedicated shortcuts, or with the "Switch to staged copy tool" custom control to get a Copy/Cut tool that also copies the entity's stage information.
This is useful for moving entities that have stage information.

Note: the resulting blueprints from these tools can also be exported to strings and shared. Do with that what you will.

### Settings remnants

If an entity with stage changes is deleted, a "settings remnant" is left behind (white outline).
If you then undo, those settings will be restored.

To remove settings remnants, use the `Staged Build Cleanup Tool` (accessed in the shortcuts menu, right of the quick-bar).

Note: this may become obsolete in the near future!

### Cleanup tool

Using the build cleanup tool will remove "settings remnants", and attempt to revive any errored entities.

Reverse-selecting using the cleanup tool will **force delete** errored entities.

### Landfill/tiles

Landfill or other tiles can be automatically placed in blueprints. See the "Stage" tab in the settings gui for more details.

The "Flexible Offshore Pump Placement" _startup_ setting enables placing offshore pumps in places not usually allowed. This may be useful when designing blueprints with offshore pumps.

More complete tiles support may come in the future.

### Blueprints

The "Blueprints" tab provides many settings for creating blueprints.

"Default" settings will affect blueprints for all stages.
"Per stage" settings will override the default settings for individual stages.

See the tooltips on options for more details.

### Map settings; set-seed map

You can set the map generation settings for your project, for example to design blueprints for a set-seed map.
See the "Sync map gen settings" button in the "Other" tab of the settings window for more details.

### Miscellaneous

If an entity overlaps with another in a higher stage, a red outline will appear where the entity should be, and a warning indicator will appear in all other stages. Use the `Staged Build Cleanup Tool` to attempt to revive these.

Rotating/upgrading an underground will affect its paired underground, in any stage.
If there are inconsistencies in underground directions due to inconsistent pair undergrounds, these will be highlighted in red.

## Feedback

Any comments, criticisms, and suggestions are greatly appreciated!

You can contact me (GlassBricks) on the AntiElitz speedrunning discord, or use the mod portal forums.

If you like what you see, consider supporting me on Ko-fi!

[![Buy Me a Coffee at ko-fi.com](https://storage.ko-fi.com/cdn/kofi2.png?v=3)](https://ko-fi.com/Z8Z1VI6P8)

## Acknowledgements

Gallery images are from AntiElitz's recent 100% blueprints.

Thanks to the [Factorio speedrunning community](https://discord.gg/AntiElitz) and [Warger](https://discord.com/invite/nfkbu6qSCj) for providing inspiration and feedback for this mod.

Thanks to @thedoh for pushing me to add (some) support for other mods.

This mod was partly inspired by [Blueprint Stages](https://mods.factorio.com/mod/blueprint-stages).

# THE TODO LIST

### Basic

- [x] Assemblies with multiple layers
- [x] Layers at positions in world

### Handle all world/user interactions

- [x] Build, mine
- [x] Recipe/configuration change
- [x] Settings paste
- [x] Rotate
- [ ] Fast replace
- [ ] Upgrade planner
  - [ ] Handle robot built
- [ ] Wire connection
- [ ] Blueprint _paste_
- [ ] Mod interactions?
- [ ] Decide what to do about ghosts/marked for deconstruction
- [ ] Detailed description on what to do when updated in various situations
  - [ ] Fill this list
  - [ ] Convention over configuration?

### Handle changes between layers

- [x] New entities
- [ ] Basic property changes
  - Partially done
- [ ] "Locked" properties
- [ ] Upgraded entities
  - [ ] Conflicts due to upgraded entities
- [ ] Upgraded modules
- [ ] Stop relying on hacky blueprinting
  - [ ] A save/paste algorithm for every building entity in the game
  - [ ] Or maybe it's not so bad to rely on blueprinting
- [ ] Neighbors/circuit connections
- [ ] Lost references (entities deleted, but has changed in other layers)
  - Meant so you don't lost information if accidentally deleted something
  - [x] Create lost references
  - [ ] Decide on a better name for it
  - [ ] Revive lost references
    - [x] Revive at same layer
    - [ ] Decide behavior if revived at different layer

### Detect and display conflicts

- [ ] Diagnostics system
- [ ] Overlapping entities
  - [ ] Detect overlapping entities
  - [ ] Show highlight
  - [ ] Automatically attempt to revive when entities change
- [ ] Incompatible properties due to upgraded entity
  - [ ] Automatically attempt to fix when entities change
- [ ] Max connections exceeded
  - [ ] How to highlight?
  - [ ] Automatically attempt to fix
- [ ] Lost references
  - [ ] Selectable?

### Other utils

- [ ] Move entity up/down
- [ ] Option to move/edit in specific layer?

### UI

- [ ] Show new vs previous layer entities
- [ ] Show conflicts/indicators in this layer/later layer
  - [ ] Overlap
  - [ ] Upgrade
  - [ ] Property changes
  - [ ] Other conflict
- [ ] Preview future layer entities?
- [ ] Show lost references
- [ ] Shortcuts?
  - [ ] Move self up/down layer
  - [ ] Move entity up/down layer
- [ ] Per entity gui
  - [ ] Show changed properties
  - [ ] Lock properties
  - [ ] Reset properties
- [ ] List all assemblies
- [ ] New assembly
- [ ] View/edit information about assembly
  - [ ] New layer
  - [ ] New layer in middle
  - [ ] Merge layers
- [ ] View/edit layers
  - [ ] Other utils
    - [ ] Reset all entities
    - [ ] Disable/enable all entities
  - [ ] Show diagnostics
    - [ ] By type
    - [ ] Teleport button
    - [ ] Resolve options (delete, remove, merge)

### Misc

- [ ] Button to reset

### Queue (one-off implementation details)

## Future

- Automatic blueprint creation
- Other simple analysis and diagnostic
- auto blueprint staging utils?
- "Select dependencies"?

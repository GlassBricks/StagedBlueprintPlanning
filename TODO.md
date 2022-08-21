# THE TODO LIST

### Basic

- [x] Assemblies with multiple layers
- [x] Layers at positions in world

### Handle all world/user interactions

- [x] Build, mine
- [x] Recipe/configuration change
- [x] Settings paste
- [x] Rotate
- [x] Fast replace
    - [x] Upgrade
    - [x] Rotate
    - [x] Replace (undergrounds)
- [x] Upgrade planner
- [x] Wire connection
- [x] Blueprint _paste_
- [ ] Mod interactions?
    - [ ] Picker dollies
- [ ] Consider alternate behaviors

### Handle changes between layers

- [x] New entities
- [x] Basic property changes
- [ ] "Locked" properties
- [x] Upgraded entities
- [x] Upgraded modules
- [x] Stop relying on hacky blueprinting
    - [x] Or maybe it's not so bad to rely on blueprinting
- [x] Neighbors/circuit connections
- [x] Lost references (entities deleted, but has changed in other layers)
    - Meant so you don't lost information if accidentally deleted something
    - [x] Create lost references
    - [x] Decide on a better name for it (settings remnant)
    - [x] Revive lost references
    - [x] Provide way to revive/delete lost references
    - [x] Notification/indication when lost reference created
- [x] Make entities from previous layers indestructible
- [x] Build to match entity in later layer, then delete
  - [x] Remember (old layer, new lower layer) pair, move instead of delete when deleted
  - [x] Clear this when config changed
  - [x] notification on build-down
  - [x] notification on delete-up

### Detect and display conflicts

- [ ] Diagnostics system
- [ ] Overlapping entities
    - [x] Detect overlapping entities
    - [x] Show highlight
    - ~~[ ] Automatically attempt to revive when entities change~~
    - [ ] Manual revive
    - [ ] Go to source
- [ ] Incompatible properties due to upgraded entity
    - [x] Automatically attempt to fix when entities change
- [ ] Max connections exceeded
    - [ ] How to highlight?
    - [ ] Automatically attempt to fix
- [ ] Lost references
    - [x] Show highlight
    - [ ] Selectable?
    - [ ] Manual revive/delete

### Other utils

- [ ] Move entity up/down
- [ ] Option to move/edit in specific layer?

### UI

- [ ] Show new vs previous layer entities
- [ ] Show conflicts/indicators in this layer/later layer
    - [x] Overlap
    - [x] Upgrade
    - [x] Property changes
    - [ ] Other conflict
- [x] Preview future layer entities?
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
        - [ ] Resolve options? (delete, remove, merge)

### Queue

- [ ] Fix indicators when entity moved up layer

### Misc

- [ ] reset button
- [ ] Handle trains?

## Future

- Automatic blueprint creation
- Other simple analysis and diagnostics
- auto blueprint staging utils?
- "Select dependencies"?

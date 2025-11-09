This describes revision and improvements to tiles and tile placement.

## Behavior:

- Placing new tiles will set the tile value for that stage, then follow normal stage propagation rules.
- Currently, tiles are impossible to mine in stages later than the first. In new behavior, this is allowed, and should be the same as setting the tile to "nil"; propagating the nil value to later stages if needed.
- It should be always possible to build or mine a tile in any stage.
- "Edit propagation" always happen in order of increasing stages, until before the next stage with changes or the last stage.

## Implementation:

There should be only up to 1 ProjectTile for every tile position.

### Values:

Data is stored as entry: (stage: number, value: string | nil). Represent as a sparse array (Record<StageNumber, string | NilPlaceholder>)

- Value is the tile name, or `nil` to represent NO tile.h
- The value at stage N is, the value of the largest configured stage that is <= N.
- The value is propagated to all future stages until the next configured stage. I.e. each entry sets the value for it's stage, and all future stages, until the next configured stage.

- There is no "lastStage"; instead, this is represented with `nil` as the last entry.
- It's possible to not explicitly define a "firstStage"; instead, this is implicitly defined by the lowest stage's entry
  - It may or may not be useful to think of an implicit entry (0, `nil`), meaning no tiles until the first entry.

### Other notes

- ProjectTile is deleted if it becomes `nil` at all stages (no entries).
- Stage propagation rules for tiles should be the same/similar to entities: if setting a value at stage N is value X, if the next higher entry also has value X, that entry is removed.
  - For performance, after setting the value at stage N, when syncing with the world, only possibly affected tiles should be updated (up until before the next entry's stage).
- Due to revised behavior, and less behavior shared with ProjectTile, it might be worth replacing the existing implementation of ProjectTile.
  - Still extract/use shared functions if possible. For e.g. stage insertion/deletion, update propagation, etc.
- Migration: keep minimal type definitions of the old ProjectTile; to enable migrating to new version

## Future enhancements:

- Save/load tile information in project import/export

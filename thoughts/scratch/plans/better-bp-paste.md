# Better Blueprint paste

Use bplib for a less hacky, more reliable, blueprint paste event handling.

See related research (2025-11-23-blueprint-paste-event-handling.md, 2025-11-23-bplib-overview.md)

## Current state

Current system uses a hacky method that modifies blueprints.
This is complex and hacky, and has limitations, such as not supporting pasting from the blueprint library.

This was only done was to be able to detect if entities were updated.
A future Factorio version will supply an event that allows this.

## New approach

We can try a new approach using bplib, now in the current Factorio version.
Bplib provides info about overlapping entities when a blueprint is pasted. We can use this instead, replacing the old approach.

Essentially, use bplib to provide an association of BlueprintEntity <-> Position, instead of getting it via entity markers.

Benefits:

- More performant
- Supports blueprint library
- No jank blueprint modification
- No need to manually connect circuit wires
- Supports "external wire connections", which uses data not available in modding API, by reading the in-world entity-state instead of relying on blueprint data.

## Implementation details

We WON'T use map_blueprint_indices_to_overlapping_entities; we will instead use map_blueprint_indices_to_world_positions, just for the positions; then apply the same approach we're using for updated entities in onEntityMarkerBuilt.

### Direction transformation

We can't use `blueprintEntity.direction` directly for the blueprint direction. Entity markers were rotated along with the blueprint during paste, but with bplib we have the raw blueprint entity data which is not pre-transformed.

To get the correct direction for matching with world entities:
1. Round blueprint entity's direction to nearest multiple of 4 (cardinal direction)
2. Apply blueprint paste's rotation (from `event.direction`)
3. Apply flipx and flipy transformations (from `event.flip_horizontal` and `event.flip_vertical`)

This requires new utilities in `lib/geometry` for transforming direction values (not positions).

### Delayed event handling

A caveat is: bplib provides these events _before_ the blueprint is pasted in world. This means we can't yet see the effect of updated entities, but we want to.
To do this, use a delayed event (see delayed-event.ts), which enables us to run code AFTER the current event has finished processing.

Flow may be:

- during on_pre_build, detect overlapping/updated entities, and store info equivalent to [BlueprintEntity, MapPosition][]
- Trigger a delayed event to check this data
- Handle updated entities only in the delayed event

As a defensive measure:

- Also "flush" stored data on any on_pre_build event (flush = check if stored data is present; and if so, update all entities first, and remove any stored data)
- Make this a function, so it can possibly be "flushed" from elsewhere too

### Toggleable via new setting

For an experimental phase, we want to toggle this feature via a new user setting, to choose between new and old behavior.

Extract any common code into new functions first.

## Implementation phases

- Make sure all cases of special blueprint tag behavior is handled
- Don't pass "known"

### Testing

- Add or update existing integration tests for blueprint pasting, to cover all code paths

### Other

bplib.d.ts is new and hasn't been tested. Needs validation that the declarations are correct.

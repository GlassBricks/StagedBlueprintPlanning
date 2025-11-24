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

Benefits:

- More performant
- Supports blueprint library
- No jank blueprint modification
- No need to manually transformations blueprint entities
- No need to manually connect circuit wires
- Supports "external wire connections", which uses data not available in modding API, by reading the in-world entity-state instead of relying on blueprint data.

## First step: remove "knownValue"

Passing "knownValue" around is only used as a performance optimization to avoid re-blueprinting an entity again. However, this is excessively complex.
We expect with new approach performance can improve enough that we can skip this.

As such, part the implementation should be removing all parameters, functions, logic, etc.. related to "knownValue", and instead always re-blueprinting to get it's value.

"knownValue" is however used to pass blueprint tags, which might contain `bp100: StageInfoExport`. We still need this in some places, as such, instead of known value, pass `StageInfoExport | nil` instead if needed.

## Implementation details

### New entities

Handling created entities (not updated ones), can now be mostly the same as normal entities.
However, this needs handling in some cases: the pasted blueprint entity may have tags, which will modify the entity besides what's in blueprint data. We need to handle this.
All the "entity built"-like should provide `tags`, which are supplied from a blueprint when the entity is built or revived from a ghost. We need to read and handle these.

### Updated entities

A caveat is: bplib provides these events _before_ the blueprint is pasted in world. This means we can't yet see the effect of updated entities, but we want to.
To do this, use a delayed event (see delayed-event.ts), which enables us to run code AFTER the current event has finished processing.

- during on_pre_build, detect overlapping/updated entities, but store needed data about updated entities
- Trigger a delayed event with the data
- Handle updated entities only in the delayed event

### Notes

- Make sure all cases of special blueprint tag behavior is handled
- Don't pass "known"

### Testing

- Add or update existing integration tests for blueprint pasting, to cover all code paths

### Other

bplib.d.ts is new and hasn't been tested. Needs validation that the declarations are correct.

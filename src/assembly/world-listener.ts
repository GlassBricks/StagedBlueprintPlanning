/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { CustomInputs, Prototypes } from "../constants"
import { DollyMovedEntityEvent } from "../declarations/PickerDollies"
import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { ProtectedEvents } from "../lib"
import { Pos } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { getStageAtSurface } from "./Assembly"
import { Assembly, Stage } from "./AssemblyDef"
import { DefaultAssemblyUpdater } from "./AssemblyUpdater"

/**
 * Hooks to factorio events, and calls AssemblyUpdater.
 */

const Events = ProtectedEvents

function getStageIfAssemblyEntity(entity: LuaEntity): Stage | nil {
  if (!entity.valid) return
  const stage = getStageAtSurface(entity.surface.index)
  if (stage && isWorldEntityAssemblyEntity(entity)) {
    return stage
  }
}

function getStageAtEntityOrPreview(entity: LuaEntity): Stage | nil {
  if (entity.valid && (isWorldEntityAssemblyEntity(entity) || entity.name.startsWith(Prototypes.PreviewEntityPrefix))) {
    return getStageAtSurface(entity.surface.index)
  }
}

function luaEntityCreated(entity: LuaEntity, player: PlayerIndex | nil): void {
  if (!entity.valid) return
  if (isMarkerEntity(entity)) entity.destroy() // only handle in on_built_entity; see below
  const stage = getStageAtSurface(entity.surface.index)
  if (!stage) return
  if (!isWorldEntityAssemblyEntity(entity)) {
    return checkNonAssemblyEntity(entity, stage, player)
  }
  DefaultAssemblyUpdater.onEntityCreated(stage.assembly, entity, stage, player)
}

function luaEntityDeleted(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageIfAssemblyEntity(entity)
  if (stage) DefaultAssemblyUpdater.onEntityDeleted(stage.assembly, entity, stage, player)
}

function luaEntityPotentiallyUpdated(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageIfAssemblyEntity(entity)
  if (stage) DefaultAssemblyUpdater.onEntityPotentiallyUpdated(stage.assembly, entity, stage, player)
}

function luaEntityMarkedForUpgrade(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageAtSurface(entity.surface.index)
  if (stage) DefaultAssemblyUpdater.onEntityMarkedForUpgrade(stage.assembly, entity, stage, player)
}

function luaEntityForceDeleted(entity: LuaEntity): void {
  const stage = getStageIfAssemblyEntity(entity)
  if (stage) DefaultAssemblyUpdater.onEntityDied(stage.assembly, entity, stage)
}

function luaEntityRotated(entity: LuaEntity, previousDirection: defines.direction, player: PlayerIndex | nil): void {
  if (!entity.valid) return
  const stage = getStageAtSurface(entity.surface.index)
  if (!stage) return
  if (isWorldEntityAssemblyEntity(entity)) {
    DefaultAssemblyUpdater.onEntityRotated(stage.assembly, entity, stage, player, previousDirection)
    return
  }
  if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) {
    entity.direction = previousDirection
    return
  }
}

/*
Event order:

Mine:
  (on_pre_player_mined_item)
  on_player_mined_entity
  (on_player_mined_item)

Regular build:
  on_pre_build
  on_built_entity

Script raise:
  script_raised_built

Fast replace:
  on_pre_build
  (on_pre_player_mined_item)
  on_player_mined_entity
  (on_player_mined_item)
  on_built_entity

Underground fast replace:
  on_pre_build
  on_player_mined_entity, 1+x
  on_built_entity

Blueprinting:
  on_pre_build
  // (nothing else)

Deconstruct:
  script_raised_destroy

Upgrade:
  on_player_mined_entity   note: no on_pre_player_mined_item
  on_built_entity

In editor mode:
Build:
  on_built_entity

Mine:
  <none>

Fast replace:
  (on_pre_player_mined_item)
  on_player_mined_entity
  (on_player_mined_item)
  on_built_entity

Event tree:
Start:
  on_player_mined_entity -> destroy
  on_pre_build: state = PreBuild
    (with blueprint in hand) -> blueprint
    on_built_entity -> build
    on_player_mined_entity: state = PossibleFastReplace
      on_player_mined_entity -> mine previous, stay in state
      on_built_entity -> fast replace
  script_raised_built -> build
  script_raised_destroy -> destroy
  on_player_mined_entity:
    on_built_entity -> fast replace
  on_built_entity -> build
*/

// simple:
Events.script_raised_built((e) => luaEntityCreated(e.entity, nil))
Events.on_robot_built_entity((e) => luaEntityCreated(e.created_entity, nil))

Events.script_raised_destroy((e) => luaEntityDeleted(e.entity, nil))
Events.on_robot_mined_entity((e) => luaEntityDeleted(e.entity, nil))

Events.on_entity_died((e) => luaEntityForceDeleted(e.entity))

Events.on_entity_settings_pasted((e) => luaEntityPotentiallyUpdated(e.destination, e.player_index))
Events.on_gui_closed((e) => {
  if (e.entity) luaEntityPotentiallyUpdated(e.entity, e.player_index)
})
Events.on_player_fast_transferred((e) => luaEntityPotentiallyUpdated(e.entity, e.player_index))

Events.on_player_rotated_entity((e) => luaEntityRotated(e.entity, e.previous_direction, e.player_index))

Events.on_marked_for_upgrade((e) => luaEntityMarkedForUpgrade(e.entity, e.player_index))

// building, mining, fast replacing: state machine

interface AnnotatedEntity extends BasicEntityInfo {
  readonly stage: Stage
  undergroundPair?: LuaEntity
  undergroundPairValue?: AnnotatedEntity
}
// in global, so no desync in case of bugs
let state: {
  currentlyInBuild?: Stage | false // if not nil, then is in build. False if not in a stage

  currentlyInBlueprintPaste?: Stage
  blueprintEntities?: BlueprintEntity[]
  blueprintOriginalNumEntities?: number

  preMinedItemCalled?: Stage | false // if not nil, then is in build. False if not in a stage
  lastDeleted?: AnnotatedEntity
}
declare global {
  interface PlayerData {
    lastWireAffectedEntity?: LuaEntity
  }
}
declare const global: GlobalWithPlayers & {
  worldListenerState: typeof state
}
Events.on_init(() => {
  state = global.worldListenerState = {}
})
Events.on_load(() => {
  state = global.worldListenerState
})

// for optimization purposes, getStageAtSurface is cached and computed as late as possible

function clearLastDeleted(player: PlayerIndex | nil): void {
  const { lastDeleted } = state
  if (lastDeleted) {
    const { stage } = lastDeleted
    if (stage.valid) {
      DefaultAssemblyUpdater.onEntityDeleted(stage.assembly, lastDeleted, stage, player)
      const { undergroundPairValue } = lastDeleted
      if (undergroundPairValue) {
        DefaultAssemblyUpdater.onEntityDeleted(stage.assembly, undergroundPairValue, stage, player)
      }
    }
    state.lastDeleted = nil
  }
}

function setLastDeleted(entity: LuaEntity, stage: Stage, player: PlayerIndex | nil): void {
  const isUnderground = entity.type === "underground-belt"
  const oldValue = state.lastDeleted
  const newValue: AnnotatedEntity = {
    name: entity.name,
    type: entity.type,
    position: entity.position,
    direction: entity.direction,
    surface: entity.surface,
    belt_to_ground_type: isUnderground ? entity.belt_to_ground_type : nil,
    stage,
  }

  if (isUnderground) {
    if (oldValue && oldValue.undergroundPair === entity) {
      oldValue.undergroundPair = nil
      oldValue.undergroundPairValue = newValue
      return
    }
    newValue.undergroundPair = entity.neighbours as LuaEntity | nil
  }

  clearLastDeleted(player)
  state.lastDeleted = newValue
}

Events.on_pre_build((e) => {
  const player = game.get_player(e.player_index)!
  const stage = getStageAtSurface(player.surface.index)
  state.currentlyInBlueprintPaste = nil
  state.blueprintEntities = nil
  if (player.is_cursor_blueprint()) {
    onPreBlueprintPasted(player, stage)
  } else {
    state.currentlyInBuild = stage ?? false
    clearLastDeleted(e.player_index)
  }
})

Events.on_pre_player_mined_item((e) => {
  const player = game.get_player(e.player_index)!
  const stage = getStageAtSurface(player.surface.index)
  state.preMinedItemCalled = stage ?? false
})

Events.on_player_mined_entity((e) => {
  const { entity } = e
  const preMinedItemCalled = state.preMinedItemCalled
  state.preMinedItemCalled = nil
  if (preMinedItemCalled === false || !isWorldEntityAssemblyEntity(entity)) return
  if (preMinedItemCalled === nil) {
    // this happens when using instant upgrade planner
    const stage = getStageAtSurface(entity.surface.index)
    state.currentlyInBuild = stage ?? false
    // fall through
  }
  const currentlyInBuild = state.currentlyInBuild

  if (currentlyInBuild === false) return // not in stage, do nothing
  if (currentlyInBuild !== nil) {
    // in a stage, set lastDeleted for fast replace
    setLastDeleted(entity, currentlyInBuild, e.player_index)
  } else {
    // normal delete
    const stage = getStageAtSurface(entity.surface.index)
    if (stage) DefaultAssemblyUpdater.onEntityDeleted(stage.assembly, entity, stage, e.player_index)
  }
})

Events.on_built_entity((e) => {
  const { created_entity: entity } = e
  if (!entity.valid) return

  const currentlyInBlueprintPaste = state.currentlyInBlueprintPaste
  if (currentlyInBlueprintPaste) {
    if (isMarkerEntity(entity)) onEntityMarkerBuilt(e, entity, currentlyInBlueprintPaste)
    return
  }
  // just in case
  if (isMarkerEntity(entity)) {
    entity.destroy()
    game.print("Marker entity was not supposed to be built")
    return
  }

  const playerIndex = e.player_index

  const currentlyInBuild = state.currentlyInBuild
  if (currentlyInBuild === false) {
    // not in stage, do nothing
    state.currentlyInBuild = nil
    return
  }

  if (currentlyInBuild === nil) {
    // editor mode build, or marker entity
    const stage = getStageAtSurface(entity.surface.index)

    if (stage) DefaultAssemblyUpdater.onEntityCreated(stage.assembly, entity, stage, playerIndex)
    return
  }

  const stage = currentlyInBuild
  const assembly = stage.assembly
  if (tryFastReplace(assembly, entity, stage, playerIndex)) {
    // upgrade successful, clear currentlyInBuild if no lastDeleted (still has underground pair)
    if (state.lastDeleted === nil) state.currentlyInBuild = nil
  } else {
    // can't upgrade, treat lastDeleted as delete instead of fast replace
    clearLastDeleted(playerIndex)
    state.currentlyInBuild = nil
    if (!isWorldEntityAssemblyEntity(entity)) {
      checkNonAssemblyEntity(entity, stage, playerIndex)
    } else {
      DefaultAssemblyUpdater.onEntityCreated(assembly, entity, stage, playerIndex)
    }
  }
})

function checkNonAssemblyEntity(entity: LuaEntity, stage: Stage, byPlayer: PlayerIndex | nil): void {
  // always revive ghost undergrounds
  if (entity.type === "entity-ghost" && entity.ghost_type === "underground-belt") {
    const [, newEntity] = entity.silent_revive()
    if (newEntity) {
      DefaultAssemblyUpdater.onEntityCreated(stage.assembly, newEntity, stage, byPlayer)
    } else if (entity.valid) entity.destroy()
  }
}

function tryFastReplace(assembly: Assembly, entity: LuaEntity, stage: Stage, player: PlayerIndex) {
  const { lastDeleted } = state
  if (!lastDeleted) return
  if (isFastReplaceable(lastDeleted, entity)) {
    DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, stage, player, lastDeleted.direction)
    state.lastDeleted = lastDeleted.undergroundPairValue
    return true
  }
  if (lastDeleted.undergroundPairValue && isFastReplaceable(lastDeleted.undergroundPairValue, entity)) {
    DefaultAssemblyUpdater.onEntityPotentiallyUpdated(
      assembly,
      entity,
      stage,
      player,
      lastDeleted.undergroundPairValue.direction,
    )
    lastDeleted.undergroundPairValue = nil
    return true
  }
  return false
}

function isFastReplaceable(old: BasicEntityInfo, next: BasicEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && getEntityCategory(old.name) === getEntityCategory(next.name)
}

// Blueprinting
// There is no event to detect if blueprint entities are _updated_; instead we use the following strategy:
// When a blueprint is about to be pasted in a stage, we modify it to add entity markers at every entity
// When the entity markers are pasted, the corresponding entity is updated
// The blueprint is reverted to its original state after the paste, when the last entity marker is pasted

const IsLastEntity = "bp100IsLastEntity"

interface MarkerTags extends Tags {
  referencedName: string
  hasCircuitWires: true
}

function getInnerBlueprint(stack: BaseItemStack | nil): BlueprintItemStack | nil {
  if (!stack || !stack.valid_for_read) return nil
  const type = stack.type
  if (type === "blueprint") return stack as BlueprintItemStack
  if (type === "blueprint-book") {
    const active = (stack as BlueprintBookItemStack).active_index
    if (!active) return nil
    const innerStack = stack.get_inventory(defines.inventory.item_main)
    if (!innerStack) return nil
    return active <= innerStack.length ? getInnerBlueprint(innerStack[active - 1]) : nil
  }
  return nil
}

function blueprintNeedsPreparation(stack: BlueprintItemStack): boolean {
  return (
    stack.valid_for_read && stack.is_blueprint && stack.is_blueprint_setup() && stack.get_blueprint_entity_count() > 0
  )
}

function fixOldBlueprint(entities: BlueprintEntity[]): void {
  // old blueprint, remove old markers
  const firstEntityMarker = entities.findIndex((e) => e.name === Prototypes.EntityMarker)
  // remove all entities after the first entity marker
  // if (firstEntityMarker >= 0) entities.splice(firstEntityMarker)
  for (const i of $range(firstEntityMarker + 1, entities.length)) {
    entities[i - 1] = nil!
  }
}

/**
 * Returns entities and original num entities if successful, nil otherwise
 * @param stack
 */
function prepareBlueprintForStagePaste(stack: BlueprintItemStack): LuaMultiReturn<[BlueprintEntity[], number] | []> {
  if (!blueprintNeedsPreparation(stack)) return $multi()
  const entities = stack.get_blueprint_entities()
  if (!entities) return $multi()

  if (stack.cost_to_build[Prototypes.EntityMarker] !== nil) fixOldBlueprint(entities)

  const numEntities = entities.length
  let nextIndex = numEntities + 1
  for (const i of $range(1, numEntities)) {
    const entity = entities[i - 1]
    const { direction } = entity
    if (direction && direction % 2 !== 0) continue // ignore diagonal stuff for now
    const { name, position } = entity
    const hasCircuitWires = entity.connections ? true : nil
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      direction,
      position,
      tags: {
        referencedName: name,
        hasCircuitWires,
      } as MarkerTags,
    }
    nextIndex++
  }
  if (nextIndex === numEntities + 1) {
    // add one anyway
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      position: { x: 0, y: 0 },
      tags: {},
    }
  }

  entities[entities.length - 1].tags![IsLastEntity] = true

  stack.set_blueprint_entities(entities)

  return $multi(entities, numEntities)
}

function revertPreparedBlueprint(stack: BlueprintItemStack): void {
  const entities = assert(state.blueprintEntities)
  const numEntities = entities.length
  const originalNumEntities = state.blueprintOriginalNumEntities!
  for (const i of $range(numEntities, originalNumEntities! + 1, -1)) {
    entities[i - 1] = nil!
  }
  stack.set_blueprint_entities(entities)
}

function onPreBlueprintPasted(player: LuaPlayer, stage: Stage | nil): void {
  if (!stage) return // do nothing
  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }
  const [entities, numEntities] = prepareBlueprintForStagePaste(blueprint)
  if (entities !== nil) {
    state.currentlyInBlueprintPaste = stage
    state.blueprintEntities = entities
    state.blueprintOriginalNumEntities = numEntities!
  }
}

function onLastEntityMarkerPasted(e: OnBuiltEntityEvent): void {
  const player = game.get_player(e.player_index)!
  const blueprint = getInnerBlueprint(player.cursor_stack)
  revertPreparedBlueprint(assert(blueprint))
  state.currentlyInBlueprintPaste = nil
  state.blueprintEntities = nil
  state.blueprintOriginalNumEntities = nil
}

function isMarkerEntity(entity: LuaEntity): boolean {
  return (
    entity.name === Prototypes.EntityMarker ||
    (entity.type === "entity-ghost" && entity.ghost_name === Prototypes.EntityMarker)
  )
}

function onEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, stage: Stage): void {
  const tags = (e.tags ?? entity.tags) as MarkerTags
  if (tags !== nil) {
    handleEntityMarkerBuilt(e, entity, tags, stage)
    if (tags[IsLastEntity] !== nil) onLastEntityMarkerPasted(e)
  }
  entity.destroy()
}

function handleEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, tags: MarkerTags, stage: Stage): void {
  const referencedName = tags.referencedName
  if (!referencedName) return
  const correspondingEntity = entity.surface.find_entity(referencedName, entity.position)
  if (!correspondingEntity) return
  DefaultAssemblyUpdater.onEntityPotentiallyUpdated(stage.assembly, correspondingEntity, stage, e.player_index)
  if (tags.hasCircuitWires) {
    DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(stage.assembly, correspondingEntity, stage, e.player_index)
  }
}

// Circuit wires and cables
// There is no event for this, so we listen to player inputs to detect potential changes, and check during on_selected_entity_changed

function markPlayerAffectedWires(player: LuaPlayer): void {
  const entity = player.selected
  if (!entity) return
  const stage = getStageIfAssemblyEntity(entity)
  if (!stage) return

  const data = global.players[player.index]
  const existingEntity = data.lastWireAffectedEntity
  if (existingEntity && existingEntity !== entity) {
    DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(stage.assembly, entity, stage, player.index)
  }
  data.lastWireAffectedEntity = entity
}

function clearPlayerAffectedWires(index: PlayerIndex): void {
  const data = global.players[index]
  const entity = data.lastWireAffectedEntity
  if (entity) {
    data.lastWireAffectedEntity = nil
    const stage = getStageIfAssemblyEntity(entity)
    if (stage) DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(stage.assembly, entity, stage, index)
  }
}

const wirePrototypes = newLuaSet("red-wire", "green-wire", "copper-cable")
Events.on(CustomInputs.Build, (e) => {
  const player = game.get_player(e.player_index)!
  const playerStack = player.cursor_stack
  if (!playerStack || !playerStack.valid_for_read || !wirePrototypes.has(playerStack.name)) return
  markPlayerAffectedWires(player)
})
Events.on(CustomInputs.RemovePoleCables, (e) => {
  markPlayerAffectedWires(game.get_player(e.player_index)!)
})
Events.on_selected_entity_changed((e) => {
  clearPlayerAffectedWires(e.player_index)
})

// Cleanup tool

function checkCleanupTool(e: OnPlayerSelectedAreaEvent): void {
  if (e.item !== Prototypes.CleanupTool) return
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const { assembly } = stage
  const updateLater: LuaEntity[] = []
  for (const entity of e.entities) {
    if (entity.train) {
      updateLater.push(entity)
    } else {
      DefaultAssemblyUpdater.onCleanupToolUsed(assembly, entity, stage)
    }
  }
  for (const entity of updateLater) {
    DefaultAssemblyUpdater.onCleanupToolUsed(assembly, entity, stage)
  }
}
function checkCleanupToolReverse(e: OnPlayerSelectedAreaEvent): void {
  if (e.item !== Prototypes.CleanupTool) return
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const { assembly } = stage
  for (const entity of e.entities) {
    DefaultAssemblyUpdater.onEntityForceDeleted(assembly, entity, stage)
  }
}

Events.onAll({
  on_player_selected_area: checkCleanupTool,
  on_player_alt_selected_area: checkCleanupTool,
  on_player_reverse_selected_area: checkCleanupToolReverse,
})

// Move to this stage custom input

Events.on(CustomInputs.MoveToThisStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntityOrPreview(entity)
  if (stage) {
    DefaultAssemblyUpdater.onMoveEntityToStage(stage.assembly, entity, stage, e.player_index)
  } else {
    player.create_local_flying_text({
      text: [L_Interaction.NotInAnAssembly],
      create_at_cursor: true,
    })
  }
})

// other mod interactions
// PickerDollies
if (remote.interfaces.PickerDollies && remote.interfaces.PickerDollies.dolly_moved_entity_id) {
  Events.onInitOrLoad(() => {
    const event = remote.call("PickerDollies", "dolly_moved_entity_id") as CustomEventId<DollyMovedEntityEvent>
    Events.on(event, (e) => {
      const stage = getStageAtEntityOrPreview(e.moved_entity)
      if (stage) {
        DefaultAssemblyUpdater.onEntityMoved(stage.assembly, e.moved_entity, stage, e.start_pos, e.player_index)
      }
    })
  })
}

export const _assertInValidState = (): void => {
  assert.same({}, state, "State is not empty")
}

export function checkEntityUpdated(entity: LuaEntity, byPlayer: PlayerIndex | nil): void {
  const stage = getStageIfAssemblyEntity(entity)
  if (stage) {
    DefaultAssemblyUpdater.onEntityPotentiallyUpdated(stage.assembly, entity, stage, byPlayer)
  }
}

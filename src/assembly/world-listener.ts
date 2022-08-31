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
import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { ProtectedEvents } from "../lib"
import { Pos } from "../lib/geometry"
import { getStageAtSurface } from "./Assembly"
import { Assembly, Stage } from "./AssemblyDef"
import { DefaultAssemblyUpdater } from "./AssemblyUpdater"
import { MarkerTags, modifyBlueprintInStackIfNeeded, validateHeldBlueprint } from "./blueprint-paste"

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
  if (isMarkerEntity(entity)) entity.destroy() // only handle in on_entity_built; see below
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

function luaEntityForceDeleted(entity: LuaEntity): void {
  const stage = getStageIfAssemblyEntity(entity)
  if (stage) DefaultAssemblyUpdater.onEntityForceDeleted(stage.assembly, entity, stage)
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
Events.on_player_rotated_entity((e) => luaEntityRotated(e.entity, e.previous_direction, e.player_index))
Events.on_player_fast_transferred((e) => luaEntityPotentiallyUpdated(e.entity, e.player_index))

interface AnnotatedEntity extends BasicEntityInfo {
  readonly stage: Stage
  undergroundPair?: LuaEntity
  undergroundPairValue?: AnnotatedEntity
}
// in global, so no desync in case of bugs
let state: {
  currentlyInBuild?: Stage | false // if not nil, then is in build. False if not in a stage
  preMinedItemCalled?: Stage | false // if not nil, then is in build. False if not in a stage
  lastDeleted?: AnnotatedEntity
}
declare global {
  interface PlayerData {
    lastWireAffectedEntity?: LuaEntity
    justClosedBlueprint?: BlueprintItemStack
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

// building, deleting, fast replacing

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
  if (player.is_cursor_blueprint()) {
    if (stage) validateHeldBlueprint(player)
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
  const playerIndex = e.player_index

  const currentlyInBuild = state.currentlyInBuild
  if (currentlyInBuild === false) {
    // not in stage, do nothing
    state.currentlyInBuild = nil
    // shouldn't happen, just in case
    if (isMarkerEntity(entity)) onEntityMarkerBuilt(e, entity, nil)
    return
  }

  if (currentlyInBuild === nil) {
    // editor mode build, or marker entity
    const stage = getStageAtSurface(entity.surface.index)

    if (isMarkerEntity(entity)) return onEntityMarkerBuilt(e, entity, stage)
    if (stage) DefaultAssemblyUpdater.onEntityCreated(stage.assembly, entity, stage, playerIndex)
    return
  }

  const stage = currentlyInBuild

  // shouldn't happen, just in case
  if (isMarkerEntity(entity)) return onEntityMarkerBuilt(e, entity, stage)

  const assembly = stage.assembly
  if (tryUpgrade(assembly, entity, stage, playerIndex)) {
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

function tryUpgrade(assembly: Assembly, entity: LuaEntity, stage: Stage, player: PlayerIndex) {
  const { lastDeleted } = state
  if (!lastDeleted) return
  if (isUpgradeable(lastDeleted, entity)) {
    DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, stage, player, lastDeleted.direction)
    state.lastDeleted = lastDeleted.undergroundPairValue
    return true
  }
  if (lastDeleted.undergroundPairValue && isUpgradeable(lastDeleted.undergroundPairValue, entity)) {
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

// blueprint in cursor
function handlePlayerHeldBlueprint(index: PlayerIndex): void {
  const player = game.get_player(index)!
  if (player.is_cursor_blueprint()) {
    const stage = getStageAtSurface(player.surface.index)
    if (stage !== nil) modifyBlueprintInStackIfNeeded(player.cursor_stack)
  }
}
Events.on_player_cursor_stack_changed((e) => handlePlayerHeldBlueprint(e.player_index))
Events.on_player_changed_surface((e) => handlePlayerHeldBlueprint(e.player_index))

// upgrading

function isUpgradeable(old: BasicEntityInfo, next: BasicEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && getEntityCategory(old.name) === getEntityCategory(next.name)
}

Events.on_marked_for_upgrade((e) => {
  const stage = getStageIfAssemblyEntity(e.entity)
  if (stage) DefaultAssemblyUpdater.onEntityMarkedForUpgrade(stage.assembly, e.entity, stage, e.player_index)
})

// Blueprinting: marker entities (when pasted)
function isMarkerEntity(entity: LuaEntity): boolean {
  return (
    entity.name === Prototypes.EntityMarker ||
    (entity.type === "entity-ghost" && entity.ghost_name === Prototypes.EntityMarker)
  )
}

function onEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, stage: Stage | nil): void {
  if (stage) handleEntityMarkerBuilt(e, entity, stage)
  entity.destroy()
}
function handleEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, stage: Stage): void {
  const tags = e.tags as MarkerTags
  if (!tags) return
  const referencedName = tags.referencedName
  if (!referencedName) return
  const correspondingEntity = entity.surface.find_entity(referencedName, entity.position)
  if (!correspondingEntity) return
  DefaultAssemblyUpdater.onEntityPotentiallyUpdated(stage.assembly, correspondingEntity, stage, e.player_index)
  if (tags.hasCircuitWires) {
    DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(stage.assembly, correspondingEntity, stage, e.player_index)
  }
}

// Circuit wires
// There is no event for this, so we listen to player inputs and on_selected_entity_changed

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

const circuitWirePrototypes = newLuaSet("red-wire", "green-wire")
Events.on(CustomInputs.Build, (e) => {
  const player = game.get_player(e.player_index)!
  const playerStack = player.cursor_stack
  if (!playerStack || !playerStack.valid_for_read || !circuitWirePrototypes.has(playerStack.name)) return
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
  for (const entity of e.entities) {
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

Events.on(CustomInputs.MoveToThisStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntityOrPreview(entity)
  if (stage) {
    DefaultAssemblyUpdater.onMoveEntityToStage(stage.assembly, entity, stage, e.player_index)
  }
})

export const _inValidState = (): boolean =>
  state.currentlyInBuild === nil && state.lastDeleted === nil && state.lastDeleted === nil

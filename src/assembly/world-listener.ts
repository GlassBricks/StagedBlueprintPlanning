/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { CustomInputs, Prototypes } from "../constants"
import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { Pos } from "../lib/geometry"
import { ProtectedEvents } from "../lib/ProtectedEvents"
import { Assembly, Stage } from "./AssemblyDef"
import { DefaultAssemblyUpdater } from "./AssemblyUpdater"
import { MarkerTags, modifyBlueprintInStackIfNeeded, validateBlueprint } from "./blueprint-paste"
import { getStageAtPosition } from "./world-register"

/**
 * Hooks to factorio events, and calls AssemblyUpdater.
 */

const Events = ProtectedEvents

function getStageAtEntity(entity: LuaEntity): LuaMultiReturn<[Assembly, Stage] | [nil]> {
  if (
    !(entity.valid && (isWorldEntityAssemblyEntity(entity) || entity.name.startsWith(Prototypes.SelectionProxyPrefix)))
  )
    return $multi(nil)
  return getStageAtPosition(entity.surface, entity.position)
}

function getStageAtEntityOrPreview(entity: LuaEntity): LuaMultiReturn<[Assembly, Stage] | [nil]> {
  if (
    !(entity.valid && (isWorldEntityAssemblyEntity(entity) || entity.name.startsWith(Prototypes.PreviewEntityPrefix)))
  )
    return $multi(nil)
  return getStageAtPosition(entity.surface, entity.position)
}

function luaEntityCreated(entity: LuaEntity, player: PlayerIndex | nil): void {
  if (isMarkerEntity(entity)) entity.destroy() // only handle in on_entity_built; see below
  const [assembly, stage] = getStageAtEntity(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityCreated(assembly, entity, stage, player)
}

function luaEntityDeleted(entity: LuaEntity, player: PlayerIndex | nil): void {
  const [assembly, stage] = getStageAtEntity(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityDeleted(assembly, entity, stage, player)
}

function luaEntityPotentiallyUpdated(entity: LuaEntity, player: PlayerIndex | nil): void {
  const [assembly, stage] = getStageAtEntity(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, stage, player)
}

function luaEntityRotated(entity: LuaEntity, previousDirection: defines.direction, player: PlayerIndex | nil): void {
  const [assembly, stage] = getStageAtEntity(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityRotated(assembly, entity, stage, player, previousDirection)
}

function luaEntityForceDeleted(entity: LuaEntity): void {
  const [assembly, stage] = getStageAtEntity(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityForceDeleted(assembly, entity, stage)
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
  currentlyInBuild?: true
  preMinedItemCalled?: true
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

// building, deleting, fast replacing

function clearLastDeleted(player: PlayerIndex | nil): void {
  const { lastDeleted } = state
  if (lastDeleted) {
    const { stage } = lastDeleted
    if (stage.valid) DefaultAssemblyUpdater.onEntityDeleted(stage.assembly, lastDeleted, stage, player)
    const { undergroundPairValue } = lastDeleted
    if (undergroundPairValue) {
      DefaultAssemblyUpdater.onEntityDeleted(stage.assembly, undergroundPairValue, stage, player)
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
  if (player.is_cursor_blueprint()) {
    validateBlueprint(player)
  } else {
    state.currentlyInBuild = true
    clearLastDeleted(e.player_index)
  }
})

Events.on_pre_player_mined_item(() => {
  state.preMinedItemCalled = true
})

Events.on_player_mined_entity((e) => {
  const preMinedItemCalled = state.preMinedItemCalled
  state.preMinedItemCalled = nil
  const { entity } = e
  const [assembly, stage] = getStageAtEntity(entity)
  if (!assembly) return
  if (!preMinedItemCalled) {
    // this happens when using instant upgrade planner
    state.currentlyInBuild = true
  }
  if (state.currentlyInBuild) {
    setLastDeleted(entity, stage, e.player_index)
  } else {
    DefaultAssemblyUpdater.onEntityDeleted(assembly, entity, stage, e.player_index)
  }
})

Events.on_built_entity((e) => {
  const { created_entity: entity } = e
  if (isMarkerEntity(entity)) {
    return onEntityMarkerBuilt(e, entity)
  }

  const [assembly, stage] = getStageAtEntity(entity)
  if (!assembly) return
  if (!state.currentlyInBuild) {
    DefaultAssemblyUpdater.onEntityCreated(assembly, entity, stage, e.player_index)
    return
  }

  if (tryUpgrade(assembly, entity, stage, e.player_index)) {
    if (state.lastDeleted === nil) state.currentlyInBuild = nil
  } else {
    clearLastDeleted(e.player_index)
    DefaultAssemblyUpdater.onEntityCreated(assembly, entity, stage, e.player_index)
    state.currentlyInBuild = nil
  }
})

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
Events.on_player_cursor_stack_changed((e) => {
  const player = game.get_player(e.player_index)!
  if (player.is_cursor_blueprint()) {
    modifyBlueprintInStackIfNeeded(player.cursor_stack)
  }
})

// upgrading

function isUpgradeable(old: BasicEntityInfo, next: BasicEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && getEntityCategory(old.name) === getEntityCategory(next.name)
}

Events.on_marked_for_upgrade((e) => {
  const [assembly, stage] = getStageAtEntity(e.entity)
  if (assembly) DefaultAssemblyUpdater.onEntityMarkedForUpgrade(assembly, e.entity, stage, e.player_index)
})

// Blueprinting: marker entities (when pasted)
function isMarkerEntity(entity: LuaEntity): boolean {
  return (
    entity.name === Prototypes.EntityMarker ||
    (entity.type === "entity-ghost" && entity.ghost_name === Prototypes.EntityMarker)
  )
}

function onEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity): void {
  handleEntityMarkerBuilt(e, entity)
  entity.destroy()
}
function handleEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity): void {
  const tags = e.tags as MarkerTags
  if (!tags) return
  const referencedName = tags.referencedName
  if (!referencedName) return
  const correspondingEntity = entity.surface.find_entity(referencedName, entity.position)
  if (!correspondingEntity) return
  const [assembly, stage] = getStageAtEntity(correspondingEntity)
  if (!assembly) return
  DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, correspondingEntity, stage, e.player_index)
  if (tags.hasCircuitWires) {
    DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, correspondingEntity, stage, e.player_index)
  }
}

// Circuit wires
// There is no event for this, so we listen to player inputs and on_selected_entity_changed

function markPlayerAffectedWires(player: LuaPlayer): void {
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntity(entity)
  if (!stage) return

  const data = global.players[player.index]
  const existingEntity = data.lastWireAffectedEntity
  if (existingEntity && existingEntity !== entity) {
    const [assembly, stage] = getStageAtEntity(entity)
    if (assembly) DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, entity, stage, player.index)
  }
  data.lastWireAffectedEntity = entity
}

function clearPlayerAffectedWires(player: LuaPlayer): void {
  const data = global.players[player.index]
  const entity = data.lastWireAffectedEntity
  if (entity) {
    data.lastWireAffectedEntity = nil
    const [assembly, stage] = getStageAtEntity(entity)
    if (assembly) DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, entity, stage, player.index)
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
  clearPlayerAffectedWires(game.get_player(e.player_index)!)
})

// Cleanup tool

function checkCleanupTool(e: OnPlayerSelectedAreaEvent): void {
  if (e.item !== Prototypes.CleanupTool) return
  for (const entity of e.entities) {
    const [assembly, stage] = getStageAtEntity(entity)
    if (!assembly) continue
    DefaultAssemblyUpdater.onCleanupToolUsed(assembly, entity, stage)
  }
}
function checkCleanupToolReverse(e: OnPlayerSelectedAreaEvent): void {
  if (e.item !== Prototypes.CleanupTool) return
  for (const entity of e.entities) {
    const [assembly, stage] = getStageAtEntity(entity)
    if (!assembly) continue
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
  const [assembly, stage] = getStageAtEntityOrPreview(entity)
  if (!assembly) return
  DefaultAssemblyUpdater.onMoveEntityToStage(assembly, entity, stage, e.player_index)
})

export const _inValidState = (): boolean => !state.currentlyInBuild && state.lastDeleted === nil

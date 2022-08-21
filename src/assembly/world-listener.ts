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
import { Events } from "../lib"
import { Pos } from "../lib/geometry"
import { Assembly, Layer } from "./Assembly"
import { DefaultAssemblyUpdater } from "./AssemblyUpdater"
import { MarkerTags, modifyBlueprintInStackIfNeeded, validateBlueprint } from "./blueprint-paste"
import { getAssemblyAtPosition } from "./world-register"

function getAssemblyAt(entity: LuaEntity): LuaMultiReturn<[Assembly, Layer] | [nil]> {
  if (
    !entity.valid ||
    (!isWorldEntityAssemblyEntity(entity) && !entity.name.startsWith(Prototypes.SelectionProxyPrefix))
  )
    return $multi(nil)
  const assembly = getAssemblyAtPosition(entity.position)
  if (assembly && assembly.valid) {
    const layer = assembly.getLayerAt(entity.surface, entity.position)
    if (layer && layer.valid) return $multi(assembly, layer)
  }
  return $multi(nil)
}

function luaEntityCreated(entity: LuaEntity): void {
  if (isMarkerEntity(entity)) entity.destroy() // only handle in on_entity_built; see below
  const [assembly, layer] = getAssemblyAt(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityCreated(assembly, entity, layer)
}

function luaEntityDeleted(entity: LuaEntity): void {
  const [assembly, layer] = getAssemblyAt(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityDeleted(assembly, entity, layer)
}

function luaEntityPotentiallyUpdated(entity: LuaEntity, previousDirection?: defines.direction): void {
  const [assembly, layer] = getAssemblyAt(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, layer, previousDirection)
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
Events.script_raised_built((e) => luaEntityCreated(e.entity))
Events.on_robot_built_entity((e) => luaEntityCreated(e.created_entity))

Events.on_entity_died((e) => luaEntityDeleted(e.entity))
Events.script_raised_destroy((e) => luaEntityDeleted(e.entity))
Events.on_robot_mined_entity((e) => luaEntityDeleted(e.entity))

Events.on_entity_settings_pasted((e) => luaEntityPotentiallyUpdated(e.destination))
Events.on_gui_closed((e) => {
  if (e.entity) luaEntityPotentiallyUpdated(e.entity)
})
Events.on_player_rotated_entity((e) => luaEntityPotentiallyUpdated(e.entity, e.previous_direction))
Events.on_player_fast_transferred((e) => luaEntityPotentiallyUpdated(e.entity))

interface AnnotatedEntity extends BasicEntityInfo {
  readonly direction: defines.direction
  readonly assembly: Assembly
  readonly layer: Layer
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
declare const global: {
  worldListenerState: typeof state
  players: GlobalPlayerData
}
Events.on_init(() => {
  state = global.worldListenerState = {}
})
Events.on_load(() => {
  state = global.worldListenerState
})

// building, deleting, fast replacing

function clearLastDeleted(): void {
  const { lastDeleted } = state
  if (lastDeleted) {
    const { assembly, layer } = lastDeleted
    if (assembly.valid && layer.valid) DefaultAssemblyUpdater.onEntityDeleted(assembly, lastDeleted, layer)
    state.lastDeleted = nil
  }
}

function setLastDeleted(entity: LuaEntity, assembly: Assembly, layer: Layer): void {
  clearLastDeleted()
  state.lastDeleted = {
    name: entity.name,
    position: entity.position,
    direction: entity.direction,
    surface: entity.surface,
    assembly,
    layer,
  }
}

Events.on_pre_build((e) => {
  const player = game.get_player(e.player_index)!
  if (!player.is_cursor_blueprint()) {
    state.currentlyInBuild = true
    clearLastDeleted()
  } else {
    validateBlueprint(player)
  }
})

Events.on_pre_player_mined_item(() => {
  state.preMinedItemCalled = true
})

Events.on_player_mined_entity((e) => {
  const preMinedItemCalled = state.preMinedItemCalled
  state.preMinedItemCalled = nil
  const { entity } = e
  const [assembly, layer] = getAssemblyAt(entity)
  if (!assembly) return
  if (!preMinedItemCalled) {
    // this happens when using instant upgrade planner
    state.currentlyInBuild = true
  }
  if (state.currentlyInBuild) {
    setLastDeleted(entity, assembly, layer)
  } else {
    DefaultAssemblyUpdater.onEntityDeleted(assembly, entity, layer)
  }
})

Events.on_built_entity((e) => {
  const { created_entity: entity } = e
  if (isMarkerEntity(entity)) {
    return onEntityMarkerBuilt(e, entity)
  }

  const [assembly, layer] = getAssemblyAt(entity)
  if (!assembly) return
  if (!state.currentlyInBuild) {
    DefaultAssemblyUpdater.onEntityCreated(assembly, entity, layer)
    return
  }

  state.currentlyInBuild = nil
  const { lastDeleted } = state
  if (lastDeleted && isUpgradeable(lastDeleted, entity)) {
    state.lastDeleted = nil
    DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, entity, layer, lastDeleted.direction)
  } else {
    clearLastDeleted()
    DefaultAssemblyUpdater.onEntityCreated(assembly, entity, layer)
  }
})

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

function luaEntityMarkedForUpgrade(entity: LuaEntity): void {
  const [assembly, layer] = getAssemblyAt(entity)
  if (assembly) DefaultAssemblyUpdater.onEntityMarkedForUpgrade(assembly, entity, layer)
}

Events.on_marked_for_upgrade((e) => luaEntityMarkedForUpgrade(e.entity))

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
  const [assembly, layer] = getAssemblyAt(correspondingEntity)
  if (!assembly) return
  DefaultAssemblyUpdater.onEntityPotentiallyUpdated(assembly, correspondingEntity, layer)
  if (tags.hasCircuitWires) {
    DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, correspondingEntity, layer)
  }
}

// Circuit wires
// There is no event for this, so we listen to player inputs and on_selected_entity_changed

function markPlayerAffectedWires(player: LuaPlayer): void {
  const entity = player.selected
  if (!entity) return
  const layer = getAssemblyAt(entity)
  if (!layer) return

  const data = global.players[player.index]!
  const existingEntity = data.lastWireAffectedEntity
  if (existingEntity && existingEntity !== entity) {
    const [assembly, layer] = getAssemblyAt(entity)
    if (assembly) DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, entity, layer)
  }
  data.lastWireAffectedEntity = entity
}

function clearPlayerAffectedWires(player: LuaPlayer): void {
  const data = global.players[player.index]!
  const entity = data.lastWireAffectedEntity
  if (entity) {
    data.lastWireAffectedEntity = nil
    const [assembly, layer] = getAssemblyAt(entity)
    if (assembly) DefaultAssemblyUpdater.onCircuitWiresPotentiallyUpdated(assembly, entity, layer)
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

Events.on_player_selected_area((e) => {
  if (e.item !== Prototypes.CleanupTool) return
  for (const entity of e.entities) {
    const [assembly, layer] = getAssemblyAt(entity)
    if (!assembly) continue
    DefaultAssemblyUpdater.onErrorEntityRevived(assembly, entity, layer)
  }
})

Events.on_player_alt_selected_area((e) => {
  if (e.item !== Prototypes.CleanupTool) return
  for (const entity of e.entities) {
    const [assembly, layer] = getAssemblyAt(entity)
    if (!assembly) continue
    DefaultAssemblyUpdater.onSettingsRemnantDeleted(assembly, entity, layer)
  }
})

export const _inValidState = (): boolean => !state.currentlyInBuild && state.lastDeleted === nil

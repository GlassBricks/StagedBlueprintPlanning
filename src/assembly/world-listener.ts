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

import { isWorldEntityAssemblyEntity } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { Events } from "../lib"
import { Pos } from "../lib/geometry"
import { Layer } from "./Assembly"
import { DefaultAssemblyUpdater } from "./AssemblyUpdater"
import { getLayerAtPosition } from "./world-register"

function getLayer(entity: LuaEntity): Layer | nil {
  if (!isWorldEntityAssemblyEntity(entity)) return
  const layer = getLayerAtPosition(entity.surface, entity.position)
  if (layer && layer.valid) return layer
}

function luaEntityCreated(entity: LuaEntity): void {
  const layer = getLayer(entity)
  if (layer) DefaultAssemblyUpdater.onEntityCreated(layer.assembly, entity, layer)
}

function luaEntityDeleted(entity: LuaEntity): void {
  const layer = getLayer(entity)
  if (layer) DefaultAssemblyUpdater.onEntityDeleted(layer.assembly, entity, layer)
}

function luaEntityPotentiallyUpdated(entity: LuaEntity): void {
  const layer = getLayer(entity)
  if (layer) DefaultAssemblyUpdater.onEntityPotentiallyUpdated(layer.assembly, entity, layer)
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

Todo: bot actions


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

Events.on_entity_died((e) => luaEntityDeleted(e.entity))
Events.script_raised_destroy((e) => luaEntityDeleted(e.entity))

Events.on_entity_settings_pasted((e) => luaEntityPotentiallyUpdated(e.destination))
Events.on_gui_closed((e) => {
  if (e.entity) luaEntityPotentiallyUpdated(e.entity)
})
Events.on_player_rotated_entity((e) => {
  const entity = e.entity
  const layer = getLayer(entity)
  if (layer) DefaultAssemblyUpdater.onEntityPotentiallyUpdated(layer.assembly, entity, layer, e.previous_direction)
})

interface AnnotatedEntity extends BasicEntityInfo {
  readonly direction: defines.direction
  readonly layer: Layer
}
// in global, so no desync in case of bugs
let state: {
  preBuildCalled?: true
  preMineItemCalled?: true
  lastDeleted?: AnnotatedEntity
}
declare const global: {
  worldListenerState: typeof state
}
Events.on_init(() => {
  state = global.worldListenerState = {}
})
Events.on_load(() => {
  state = global.worldListenerState
})

function clearLastDeleted(): void {
  const { lastDeleted } = state
  if (lastDeleted) {
    const layer = lastDeleted.layer
    if (layer.valid) DefaultAssemblyUpdater.onEntityDeleted(layer.assembly, lastDeleted, layer)
    state.lastDeleted = nil
  }
}

function setLastDeleted(layer: Layer, entity: LuaEntity): void {
  clearLastDeleted()
  state.lastDeleted = {
    name: entity.name,
    position: entity.position,
    direction: entity.direction,
    layer,
  }
}

Events.on_pre_build((e) => {
  const player = game.get_player(e.player_index)!
  if (!player.is_cursor_blueprint()) {
    state.preBuildCalled = true
    clearLastDeleted()
  }
  // todo: handle blueprints
})

Events.on_player_mined_entity((e) => {
  // todo: without on_pre_player_mined_item
  const { entity } = e
  const layer = getLayer(entity)
  if (!layer) return
  if (state.preBuildCalled) {
    setLastDeleted(layer, entity)
  } else {
    DefaultAssemblyUpdater.onEntityDeleted(layer.assembly, entity, layer)
  }
})

Events.on_built_entity((e) => {
  const { created_entity: entity } = e
  const layer = getLayer(entity)
  if (!layer) return
  if (!state.preBuildCalled) {
    DefaultAssemblyUpdater.onEntityCreated(layer.assembly, entity, layer)
    return
  }

  state.preBuildCalled = nil
  const { lastDeleted } = state
  if (lastDeleted && isUpgradeable(lastDeleted, entity)) {
    state.lastDeleted = nil
    DefaultAssemblyUpdater.onEntityPotentiallyUpdated(layer.assembly, entity, layer, lastDeleted.direction)
  } else {
    clearLastDeleted()
    DefaultAssemblyUpdater.onEntityCreated(layer.assembly, entity, layer)
  }
})

function isUpgradeable(old: BasicEntityInfo, next: BasicEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && getEntityCategory(old.name) === getEntityCategory(next.name)
}

// todo: upgrades, fast replace, blueprinting, bot stuff, circuit wires, go through the list of events

export const _inValidState = (): boolean => !state.preBuildCalled && state.lastDeleted === nil

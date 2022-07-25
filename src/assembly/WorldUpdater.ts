/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  applyDiffToEntity,
  AssemblyEntity,
  getValueAtLayer,
  LayerNumber,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { createEntity, matchEntity } from "../entity/diff"
import { mutableShallowCopy } from "../lib"
import { LayerPosition } from "./Assembly"

export interface WorldUpdaterParams {
  readonly layers: Record<number, LayerPosition>
}

/** @noSelf */
export interface WorldUpdater {
  /** Either new, in which [stopAt] is nil, or added below, in which [stopAt] is the old layer number */
  add(
    assembly: WorldUpdaterParams,
    entity: MutableAssemblyEntity,
    stopAt: LayerNumber | nil,
    addedEntity: LuaEntity | nil,
  ): void
  /** Must already exist in assembly */
  refresh(
    assembly: WorldUpdaterParams,
    assemblyEntity: MutableAssemblyEntity,
    layer: LayerNumber,
    luaEntity: LuaEntity,
  ): void
  /** Tries to add the all entities to all layers, with their given values */
  revive(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, addedEntity: LuaEntity | nil): void
  /** Must be at base layer */
  // todo: add "up to", for only deleting from lower layers
  delete(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void
  deletionForbidden(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void
  update(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void
}

declare const luaLength: LuaLength<Record<number, any>, number>

function add(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  stopAt: LayerNumber | nil,
  addedEntity: LuaEntity | nil,
): void {
  const { baseEntity, layerNumber, worldEntities } = entity
  const { layers } = assembly

  if (addedEntity) worldEntities[layerNumber] = addedEntity
  const startLayer = addedEntity ? layerNumber + 1 : layerNumber

  for (const curLayer of $range(startLayer, stopAt ? stopAt - 1 : luaLength(layers))) {
    if (curLayer === stopAt) break
    const layer = layers[curLayer]
    worldEntities[curLayer] = createEntity(layer, entity, baseEntity)
  }
}

function refresh(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  layer: LayerNumber,
  luaEntity: LuaEntity,
): void {
  const value = assert(getValueAtLayer(entity, layer))
  matchEntity(luaEntity, value)
  entity.worldEntities[layer] = luaEntity
}

function revive(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, addedEntity: LuaEntity | nil): void {
  const { layerChanges } = entity
  if (!layerChanges) {
    return add(assembly, entity, nil, addedEntity)
  }

  const { baseEntity, layerNumber, worldEntities } = entity
  const { layers } = assembly

  if (addedEntity) worldEntities[layerNumber] = addedEntity
  const startLayer = addedEntity ? layerNumber + 1 : layerNumber

  const curValue = mutableShallowCopy(baseEntity)
  for (const curLayer of $range(startLayer, luaLength(layers))) {
    const changes = layerChanges[curLayer]
    if (changes) applyDiffToEntity(curValue, changes)

    const layer = layers[curLayer]
    worldEntities[curLayer] = createEntity(layer, entity, curValue)
  }
}

function _delete(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void {
  const { worldEntities } = entity
  for (const [layer, luaEntity] of pairs(worldEntities)) {
    if (luaEntity.valid) luaEntity.destroy()
    worldEntities[layer] = nil
  }
}

function deletionForbidden(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  layerNumber: LayerNumber,
): void {
  const value = assert(getValueAtLayer(entity, layerNumber))
  const layer = assembly.layers[layerNumber]
  const { worldEntities } = entity
  worldEntities[layerNumber]?.destroy()
  entity.worldEntities[layerNumber] = createEntity(layer, entity, value)
}
function update(assembly: WorldUpdaterParams, entity: AssemblyEntity, layerNumber: LayerNumber): void {
  const { worldEntities, layerChanges } = entity
  const { layers } = assembly
  const curValue = getValueAtLayer(entity, layerNumber)!
  for (const curLayer of $range(layerNumber, luaLength(layers))) {
    if (curLayer !== layerNumber && layerChanges) {
      const changes = layerChanges[curLayer]
      if (changes) applyDiffToEntity(curValue, changes)
    }
    const worldEntity = worldEntities[curLayer]
    if (worldEntity && worldEntity.valid) {
      matchEntity(worldEntity, curValue)
    }
  }
}

export const WorldUpdater: WorldUpdater = {
  add,
  refresh,
  revive,
  delete: _delete,
  deletionForbidden,
  update,
}

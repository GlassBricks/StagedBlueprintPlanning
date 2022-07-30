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
  destroyAllWorldEntities,
  destroyWorldEntity,
  Entity,
  getValueAtLayer,
  getWorldEntity,
  iterateWorldEntities,
  LayerNumber,
  MutableAssemblyEntity,
  replaceOrDestroyWorldEntity,
  replaceWorldEntity,
} from "../entity/AssemblyEntity"
import { destroyAllErrorHighlights, setErrorHighlight } from "../entity/highlights"
import { createEntity, matchEntity } from "../entity/world-entity"
import { mutableShallowCopy } from "../lib"
import { LayerPosition } from "./Assembly"

export interface WorldUpdaterParams {
  readonly layers: Record<LayerNumber, LayerPosition>
}

/** @noSelf */
export interface WorldUpdater {
  /** After a new entity is added, creates in-world entities of it at higher layers. */
  createLaterEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, stopAt: LayerNumber | nil): void
  /** Sets the given lua entity to match the assembly entity state at the given layer. */
  refreshEntity(
    assembly: WorldUpdaterParams,
    assemblyEntity: MutableAssemblyEntity,
    layer: LayerNumber,
    luaEntity: LuaEntity,
  ): void
  /** Matches or creates the entity at the base layer. Creates entities at higher layers. Uses layerChanges if present. */
  reviveEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, baseAddedEntity: LuaEntity | nil): void
  /** Deletes all lua entities. */
  deleteAllEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void
  /** Un-deletes a lua entity at layer. */
  forbidDeletion(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void
  /** Updates all entities at and above the give layer to match the assembly entity state. */
  updateEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, startLayer: LayerNumber): void

  /** Rotates all entities to match the assembly entity state */
  rotateEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void
  /** Un-rotates a lua entity at layer */
  rotationForbidden(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void
}

declare const luaLength: LuaLength<Record<number, any>, number>

function createWorldEntity(
  entity: MutableAssemblyEntity,
  value: Entity,
  layerNumber: LayerNumber,
  layerPosition: LayerPosition,
): void {
  destroyWorldEntity(entity, layerNumber)
  const worldEntity = createEntity(layerPosition, entity, value)
  replaceOrDestroyWorldEntity(entity, worldEntity, layerNumber)
  setErrorHighlight(entity, layerPosition, worldEntity === nil)
}

function createLaterEntities(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  stopAt: LayerNumber | nil,
): void {
  const { baseEntity, layerNumber } = entity
  const { layers } = assembly

  const startLayer = layerNumber + 1
  const stopLayer = stopAt ? stopAt - 1 : luaLength(layers)

  for (const curLayer of $range(startLayer, stopLayer)) {
    const layer = layers[curLayer]
    createWorldEntity(entity, baseEntity, curLayer, layer)
  }
}

function refreshEntity(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  layer: LayerNumber,
  luaEntity: LuaEntity,
): void {
  const value = assert(getValueAtLayer(entity, layer))
  replaceWorldEntity(entity, luaEntity, layer) // in case different entity was created
  matchEntity(luaEntity, value)
}

function reviveEntities(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  addedEntity: LuaEntity | nil,
): void {
  const layerChanges = entity.layerChanges ?? {}
  const { baseEntity, layerNumber } = entity
  const { layers } = assembly

  if (addedEntity) replaceWorldEntity(entity, addedEntity, layerNumber)
  const startLayer = addedEntity ? layerNumber + 1 : layerNumber

  const curValue = mutableShallowCopy(baseEntity)
  for (const curLayer of $range(startLayer, luaLength(layers))) {
    const layer = layers[curLayer]
    const changes = layerChanges[curLayer]
    if (changes) applyDiffToEntity(curValue, changes)

    createWorldEntity(entity, curValue, curLayer, layer)
  }
}

function deleteAllEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void {
  destroyAllWorldEntities(entity)
  destroyAllErrorHighlights(entity)
}

function forbidDeletion(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layerNumber: LayerNumber): void {
  const value = assert(getValueAtLayer(entity, layerNumber))
  const layer = assembly.layers[layerNumber]
  destroyWorldEntity(entity, layerNumber)
  const newEntity = createEntity(layer, entity, value)
  replaceOrDestroyWorldEntity(entity, newEntity, layerNumber)
}

function updateEntities(assembly: WorldUpdaterParams, entity: AssemblyEntity, layerNumber: LayerNumber): void {
  const { layerChanges } = entity
  const { layers } = assembly
  const curValue = getValueAtLayer(entity, layerNumber)!
  for (const curLayer of $range(layerNumber, luaLength(layers))) {
    if (curLayer !== layerNumber && layerChanges) {
      const changes = layerChanges[curLayer]
      if (changes) applyDiffToEntity(curValue, changes)
    }
    const worldEntity = getWorldEntity(entity, curLayer)
    if (worldEntity) matchEntity(worldEntity, curValue)
  }
}

function rotateEntities(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void {
  const newDirection = entity.direction ?? 0
  for (const [, luaEntity] of iterateWorldEntities(entity)) {
    luaEntity.direction = newDirection
  }
}

function rotationForbidden(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void {
  const luaEntity = getWorldEntity(entity, layer)
  if (luaEntity) luaEntity.direction = entity.direction ?? 0
}

export const WorldUpdater: WorldUpdater = {
  createLaterEntities,
  refreshEntity,
  reviveEntities,
  deleteAllEntities,
  forbidDeletion,
  updateEntities,
  rotateEntities,
  rotationForbidden,
}

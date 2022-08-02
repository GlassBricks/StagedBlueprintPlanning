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

import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { applyDiffToEntity } from "../entity/diff"
import { Entity } from "../entity/Entity"
import { DefaultEntityHandler, EntityCreator } from "../entity/EntityHandler"
import { mutableShallowCopy } from "../lib"
import { AssemblyPosition, LayerPosition } from "./Assembly"
import { destroyAllErrorHighlights, setErrorHighlight } from "./highlights"

/** @noSelf */
export interface WorldUpdater {
  /** After a new entity is added, creates in-world entities of it at higher layers. */
  createLaterEntities(assembly: AssemblyPosition, entity: AssemblyEntity, stopAt: LayerNumber | nil): void
  /** Sets the given lua entity to match the assembly entity state at the given layer. */
  refreshEntity(
    assembly: AssemblyPosition,
    assemblyEntity: AssemblyEntity,
    layer: LayerNumber,
    luaEntity: LuaEntity,
  ): void
  /** Matches or creates the entity at the base layer. Creates entities at higher layers. Uses layerChanges if present. */
  reviveEntities(assembly: AssemblyPosition, entity: AssemblyEntity, baseAddedEntity: LuaEntity | nil): void
  /** Deletes all lua entities. */
  deleteAllEntities(assembly: AssemblyPosition, entity: AssemblyEntity): void
  /** Un-deletes a lua entity at layer. */
  forbidDeletion(assembly: AssemblyPosition, entity: AssemblyEntity, layer: LayerNumber): void
  /** Updates all entities at and above the give layer to match the assembly entity state. */
  updateEntities(assembly: AssemblyPosition, entity: AssemblyEntity, startLayer: LayerNumber): void

  /** Rotates all entities to match the assembly entity state */
  rotateEntities(assembly: AssemblyPosition, entity: AssemblyEntity): void
  /** Un-rotates a lua entity at layer */
  forbidRotation(assembly: AssemblyPosition, entity: AssemblyEntity, layer: LayerNumber): void
}

declare const luaLength: LuaLength<Record<number, any>, number>

export function createWorldUpdater(entityCreator: EntityCreator): WorldUpdater {
  interface AssemblyPosition {
    readonly layers: Record<LayerNumber, LayerPosition>
  }
  const { createEntity, updateEntity } = entityCreator

  function createWorldEntity(
    entity: AssemblyEntity,
    value: Entity,
    layerNumber: LayerNumber,
    layerPosition: LayerPosition,
  ): void {
    entity.destroyWorldEntity(layerNumber)
    const worldEntity = createEntity(layerPosition, entity, value)
    entity.replaceOrDestroyWorldEntity(layerNumber, worldEntity)
    setErrorHighlight(entity, layerPosition, worldEntity === nil)
  }

  function createLaterEntities(assembly: AssemblyPosition, entity: AssemblyEntity, stopAt: LayerNumber | nil): void {
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
    assembly: AssemblyPosition,
    entity: AssemblyEntity,
    layer: LayerNumber,
    luaEntity: LuaEntity,
  ): void {
    const value = assert(entity.getValueAtLayer(layer))
    entity.replaceOrDestroyWorldEntity(layer, luaEntity) // in case different entity was created
    updateEntity(luaEntity, value)
  }

  function reviveEntities(assembly: AssemblyPosition, entity: AssemblyEntity, addedEntity: LuaEntity | nil): void {
    const layerChanges = entity.layerChanges ?? {}
    const { baseEntity, layerNumber } = entity
    const { layers } = assembly

    if (addedEntity) entity.replaceOrDestroyWorldEntity(layerNumber, addedEntity)
    const startLayer = addedEntity ? layerNumber + 1 : layerNumber

    const curValue = mutableShallowCopy(baseEntity)
    for (const curLayer of $range(startLayer, luaLength(layers))) {
      const layer = layers[curLayer]
      const changes = layerChanges[curLayer]
      if (changes) applyDiffToEntity(curValue, changes)

      createWorldEntity(entity, curValue, curLayer, layer)
    }
  }

  function deleteAllEntities(assembly: AssemblyPosition, entity: AssemblyEntity): void {
    // destroyAllWorldEntities(entity)
    for (const [, worldEntity] of entity.iterateWorldEntities(entity)) {
      worldEntity.destroy()
    }
    destroyAllErrorHighlights(entity)
  }

  function forbidDeletion(assembly: AssemblyPosition, entity: AssemblyEntity, layerNumber: LayerNumber): void {
    const value = assert(entity.getValueAtLayer(layerNumber))
    const layer = assembly.layers[layerNumber]
    entity.destroyWorldEntity(layerNumber)
    const newEntity = createEntity(layer, entity, value)
    entity.replaceOrDestroyWorldEntity(layerNumber, newEntity)
  }

  function updateEntities(assembly: AssemblyPosition, entity: AssemblyEntity, layerNumber: LayerNumber): void {
    const { layerChanges } = entity
    const { layers } = assembly
    const curValue = entity.getValueAtLayer(layerNumber)!
    for (const curLayer of $range(layerNumber, luaLength(layers))) {
      if (curLayer !== layerNumber && layerChanges) {
        const changes = layerChanges[curLayer]
        if (changes) applyDiffToEntity(curValue, changes)
      }
      const worldEntity = entity.getWorldEntity(curLayer)
      if (worldEntity) updateEntity(worldEntity, curValue)
    }
  }

  function rotateEntities(assembly: AssemblyPosition, entity: AssemblyEntity): void {
    const newDirection = entity.direction ?? 0
    for (const [, luaEntity] of entity.iterateWorldEntities(entity)) {
      luaEntity.direction = newDirection
    }
  }

  function forbidRotation(assembly: AssemblyPosition, entity: AssemblyEntity, layer: LayerNumber): void {
    const luaEntity = entity.getWorldEntity(layer)
    if (luaEntity) luaEntity.direction = entity.direction ?? 0
  }

  return {
    createLaterEntities,
    refreshEntity,
    reviveEntities,
    deleteAllEntities,
    forbidDeletion,
    updateEntities,
    rotateEntities,
    forbidRotation,
  }
}

export const DefaultWorldUpdater = createWorldUpdater(DefaultEntityHandler)

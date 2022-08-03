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

import { AssemblyEntity, createAssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { getEntityDiff } from "../entity/diff"
import { Entity } from "../entity/Entity"
import { DefaultEntityHandler, EntitySaver, getLayerPosition } from "../entity/EntityHandler"
import { AssemblyContent, LayerPosition } from "./Assembly"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/** @noSelf */
export interface AssemblyUpdater {
  onEntityCreated<E extends Entity = Entity>(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
  ): AssemblyEntity<E> | nil
  onEntityDeleted(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void
  onEntityPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void

  onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection: defines.direction,
  ): void
}

export function createAssemblyUpdater(worldUpdater: WorldUpdater, entitySaver: EntitySaver): AssemblyUpdater {
  const {
    createLaterEntities,
    deleteAllEntities,
    forbidDeletion,
    forbidRotation,
    refreshEntity,
    reviveEntities,
    rotateEntities,
    updateEntities,
  } = worldUpdater

  const { saveEntity } = entitySaver

  function onEntityCreated<E extends Entity = Entity>(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
  ): AssemblyEntity<E> | nil
  function onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): AssemblyEntity | nil {
    const position = getLayerPosition(entity, layer)
    const { layerNumber } = layer
    const { content } = assembly

    const existing = content.findCompatible(entity, position, entity.direction)
    if (existing) {
      const existingLayer = existing.getBaseLayer()
      if (existingLayer <= layerNumber) {
        entityAddedAbove(assembly, existing, layerNumber, entity)
        return existing
      }
    }

    const saved = saveEntity(entity)
    if (existing) {
      // layerNumber < existing.layerNumber
      entityAddedBelow(assembly, existing, layerNumber, saved!, entity)
      return existing
    }

    if (!saved) return

    const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, layerNumber)
    content.add(assemblyEntity)
    assemblyEntity.replaceOrDestroyWorldEntity(layerNumber, entity)
    createLaterEntities(assembly, assemblyEntity, nil)
    return assemblyEntity
  }

  function entityAddedAbove(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): void {
    if (existing.isLostReference) {
      reviveLostReference(assembly, existing, layerNumber, entity)
    } else {
      refreshEntity(assembly, existing, layerNumber, entity)
    }
  }

  function reviveLostReference(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): void {
    // assert(layerNumber >= existing.layerNumber)
    // assert(existing.isLostReference)
    existing.isLostReference = nil
    // existing.moveEntityUp(layerNumber)
    existing.moveEntityTo(layerNumber)
    reviveEntities(assembly, existing, entity)
  }

  function entityAddedBelow(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    added: Entity,
    luaEntity: LuaEntity,
  ): void {
    const oldLayerNumber = existing.moveEntityDown(layerNumber, added, true)
    if (existing.isLostReference) {
      existing.isLostReference = nil
      reviveEntities(assembly, existing, luaEntity)
    } else {
      createLaterEntities(assembly, existing, oldLayerNumber)
    }
  }

  function onEntityDeleted(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void {
    const position = getLayerPosition(entity, layer)
    const { content } = assembly

    const existing = content.findCompatible(entity, position, entity.direction)
    if (!existing) return
    const { layerNumber } = layer
    const existingLayer = existing.getBaseLayer()

    if (existingLayer !== layerNumber) {
      if (existingLayer < layerNumber) {
        forbidDeletion(assembly, existing, layerNumber)
      }
      // else: layerNumber > compatible.layerNumber; is bug, ignore
      return
    }

    if (existing.hasLayerChanges()) {
      existing.isLostReference = true
    } else {
      content.remove(existing)
    }
    deleteAllEntities(assembly, existing)
  }

  function onEntityPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void {
    const position = getLayerPosition(entity, layer)
    const { content } = assembly
    const { layerNumber } = layer

    const existing = content.findCompatible(entity, position, entity.direction)
    const existingLayer = existing && existing.getBaseLayer()
    if (!existing || layerNumber < existingLayer!) {
      // bug, treat as add
      onEntityCreated(assembly, entity, layer)
      return
    }

    // get diff
    const newValue = saveEntity(entity)
    if (!newValue) return // bug?
    const valueAtLayer = existing.getValueAtLayer(layerNumber)!
    const diff = getEntityDiff(valueAtLayer, newValue)
    if (!diff) return // no change

    existing.applyDiffAtLayer(layerNumber, diff)
    updateEntities(assembly, existing, layerNumber)
  }

  function onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection: defines.direction,
  ): void {
    const position = getLayerPosition(entity, layer)
    const { content } = assembly
    const { layerNumber } = layer

    const existing = content.findCompatible(entity, position, previousDirection)
    if (!existing) return
    const existingLayer = existing.getBaseLayer()

    if (existingLayer !== layerNumber) {
      forbidRotation(assembly, existing, layerNumber)
    } else {
      existing.direction = entity.direction !== 0 ? entity.direction : nil
      rotateEntities(assembly, existing)
    }
  }
  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
    onEntityRotated,
  }
}

export const DefaultAssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(DefaultWorldUpdater, DefaultEntityHandler)

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
import { BasicEntityInfo, Entity } from "../entity/Entity"
import { DefaultEntityHandler, EntitySaver, getLayerPosition } from "../entity/EntityHandler"
import { AssemblyContent, LayerPosition } from "./Assembly"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/** @noSelf */
export interface AssemblyUpdater {
  onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void
  onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, layer: LayerPosition): void
  onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): void
}

export function createAssemblyUpdater(worldUpdater: WorldUpdater, entitySaver: EntitySaver): AssemblyUpdater {
  const { deleteAllWorldEntities, updateWorldEntities } = worldUpdater
  const { saveEntity } = entitySaver

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

    // entity added here
    const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, layerNumber)
    content.add(assemblyEntity)
    assemblyEntity.replaceWorldEntity(layerNumber, entity)
    updateWorldEntities(assembly, assemblyEntity, layerNumber + 1)
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
      updateWorldEntities(assembly, existing, layerNumber, layerNumber)
    }
  }

  function reviveLostReference(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): void {
    existing.isLostReference = nil
    existing.moveToLayer(layerNumber)
    existing.replaceWorldEntity(layerNumber, entity)
    updateWorldEntities(assembly, existing, layerNumber, nil, true)
  }

  function entityAddedBelow(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    added: Entity,
    luaEntity: LuaEntity,
  ): void {
    const oldLayerNumber = existing.moveDown(layerNumber, added, true)
    if (existing.isLostReference) {
      reviveLostReference(assembly, existing, layerNumber, luaEntity)
    } else {
      existing.replaceWorldEntity(layerNumber, luaEntity)
      updateWorldEntities(assembly, existing, layerNumber + 1, oldLayerNumber - 1, true)
    }
  }

  function onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, layer: LayerPosition): void {
    const position = getLayerPosition(entity, layer)
    const { content } = assembly

    const existing = content.findCompatible(entity, position, entity.direction)
    if (!existing) return
    const { layerNumber } = layer
    const existingLayer = existing.getBaseLayer()

    if (existingLayer !== layerNumber) {
      if (existingLayer < layerNumber) {
        updateWorldEntities(assembly, existing, layerNumber, layerNumber, true)
      }
      // else: layerNumber > compatible.layerNumber; is bug, ignore
      return
    }

    if (existing.hasLayerChanges()) {
      existing.isLostReference = true
    } else {
      content.remove(existing)
    }
    deleteAllWorldEntities(assembly, existing)
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): void {
    const position = getLayerPosition(entity, layer)
    const { content } = assembly
    const { layerNumber } = layer

    const existing = content.findCompatible(entity, position, previousDirection ?? entity.direction)
    const existingLayer = existing && existing.getBaseLayer()
    if (!existing || layerNumber < existingLayer!) {
      // bug, treat as add
      onEntityCreated(assembly, entity, layer)
      return
    }

    existing.replaceWorldEntity(layerNumber, entity)

    // check rotation
    const hasRotation = previousDirection && previousDirection !== entity.direction
    const rotateAllowed = hasRotation && existingLayer === layerNumber
    if (rotateAllowed) {
      existing.direction = entity.direction !== 0 ? entity.direction : nil
    }

    const newValue = saveEntity(entity)
    if (!newValue) return // bug?
    const valueAtLayer = existing.getValueAtLayer(layerNumber)!
    const diff = getEntityDiff(valueAtLayer, newValue)
    if (diff) {
      existing.applyDiffAtLayer(layerNumber, diff)
    }
    if (diff || rotateAllowed) {
      updateWorldEntities(assembly, existing, layerNumber)
    } else if (hasRotation) {
      updateWorldEntities(assembly, existing, layerNumber, layerNumber) // only this entity
    } // else, do nothing
  }

  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
  }
}

export const DefaultAssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(DefaultWorldUpdater, DefaultEntityHandler)

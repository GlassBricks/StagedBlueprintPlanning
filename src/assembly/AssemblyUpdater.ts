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
import { AssemblyWireConnection } from "../entity/AssemblyWireConnection"
import { BasicEntityInfo, Entity } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { DefaultEntityHandler, EntitySaver, getLayerPosition } from "../entity/EntityHandler"
import { AssemblyContent, LayerPosition } from "./Assembly"
import { EntityMap } from "./EntityMap"
import { DefaultWireHandler, WireSaver } from "./WireHandler"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/** @noSelf */
export interface AssemblyUpdater {
  /** Handles when an entity is created. */
  onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void
  /** Handles when an entity is removed. */
  onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, layer: LayerPosition): void
  /**
   * Handles when an entity has its properties updated.
   * Checks ALL properties except wire connections.
   * Handles rotation (if previousDirection is provided).
   */
  onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): void
  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, and cancels upgrade.
   * Also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void
}

export function createAssemblyUpdater(
  worldUpdater: WorldUpdater,
  entitySaver: EntitySaver,
  wireSaver: WireSaver,
): AssemblyUpdater {
  const { deleteAllWorldEntities, updateWorldEntities } = worldUpdater
  const { saveEntity } = entitySaver
  const { getWireConnectionDiff } = wireSaver

  function onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): AssemblyEntity | nil {
    const position = getLayerPosition(layer, entity)
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

    // add new entity
    const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, layerNumber)
    content.add(assemblyEntity)
    handleCircuitWires(assembly, assemblyEntity, layerNumber, entity)

    assemblyEntity.replaceWorldEntity(layerNumber, entity)
    updateWorldEntities(assembly, assemblyEntity, layerNumber + 1)
    return assemblyEntity
  }

  function handleCircuitWires(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): boolean {
    const [added, removed] = getWireConnectionDiff(assembly, assemblyEntity, layerNumber, entity)
    if (added === false || (!added && !removed)) return false
    const { content } = assembly
    if (added) {
      for (const connection of added) {
        content.addWireConnection(connection)
      }
    }
    if (removed) {
      for (const connection of removed as AssemblyWireConnection[]) {
        content.removeWireConnection(connection)
      }
    }
    return true
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
      updateWorldEntities(assembly, existing, layerNumber, oldLayerNumber - 1, true)
    }
  }

  function findCompatible(
    content: EntityMap,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): AssemblyEntity | nil {
    const position = getLayerPosition(layer, entity)
    const existing = content.findCompatible(entity, position, previousDirection ?? entity.direction)
    if (existing && layer.layerNumber >= existing.getBaseLayer()) return existing
  }

  function onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, layer: LayerPosition): void {
    const position = getLayerPosition(layer, entity)
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
      content.delete(existing)
    }
    deleteAllWorldEntities(assembly, existing)
  }

  function getCompatibleOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): AssemblyEntity | nil {
    const compatible = findCompatible(assembly.content, entity, layer, previousDirection)
    if (compatible) {
      compatible.replaceWorldEntity(layer.layerNumber, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, layer)
    }
    return compatible
  }

  function doUpdate(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layerNumber: number,
    existing: AssemblyEntity,
    rotateTo: defines.direction | nil,
    upgradeTo?: string | nil,
  ): void {
    const rotateAllowed = rotateTo !== nil && existing.getBaseLayer() === layerNumber
    if (rotateAllowed) {
      existing.direction = rotateTo !== 0 ? rotateTo : nil
    }
    // else, direction will be reset by updateWorldEntities

    const newValue = saveEntity(entity)
    if (!newValue) return // bug?
    if (upgradeTo) newValue.name = upgradeTo

    const hasDiff = existing.adjustValueAtLayer(layerNumber, newValue)
    if (hasDiff || rotateAllowed) {
      // if diff, update all entities
      updateWorldEntities(assembly, existing, layerNumber)
    } else if (rotateTo) {
      // else, only this entity (if rotation forbidden)
      updateWorldEntities(assembly, existing, layerNumber, layerNumber)
    } // else, no diff, do nothing
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, layer, previousDirection)
    if (!existing) return

    const rotation = previousDirection && previousDirection !== entity.direction ? entity.direction : nil
    doUpdate(assembly, entity, layer.layerNumber, existing, rotation)
  }

  function onEntityMarkedForUpgrade(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void {
    const existing = getCompatibleOrAdd(assembly, entity, layer)
    if (!existing) return

    const upgradeDirection = entity.get_upgrade_direction()
    let upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      // assert(getEntityCategory(upgradeType) === existing.categoryName)
      if (getEntityCategory(upgradeType) !== existing.categoryName) {
        game.print(
          `WARNING: incompatible upgrade type to ${upgradeType}: category ${getEntityCategory(
            upgradeType,
          )}, existing category: ${existing.categoryName}`,
        )
        upgradeType = nil
      }
    }
    if (upgradeDirection || upgradeType) {
      doUpdate(assembly, entity, layer.layerNumber, existing, upgradeDirection, upgradeType)
    }
    if (entity.valid) entity.cancel_upgrade("player")
  }

  function onEntityCircuitWiresPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, layer)
    if (!existing) return
    if (handleCircuitWires(assembly, existing, layer.layerNumber, entity)) {
      updateWorldEntities(assembly, existing, existing.getBaseLayer())
    }
  }

  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
    onEntityMarkedForUpgrade,
    onCircuitWiresPotentiallyUpdated: onEntityCircuitWiresPotentiallyUpdated,
  }
}

export const DefaultAssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(
  DefaultWorldUpdater,
  DefaultEntityHandler,
  DefaultWireHandler,
)

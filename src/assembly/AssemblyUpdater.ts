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

import { Prototypes } from "../constants"
import { AssemblyEntity, createAssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { DefaultEntityHandler, EntitySaver, getLayerPosition } from "../entity/EntityHandler"
import { L_Interaction } from "../locale"
import { AssemblyContent, LayerPosition } from "./AssemblyContent"
import { DefaultWireHandler, WireSaver } from "./WireHandler"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"

/**
 * Updates assembly in response to world changes.
 *
 * @noSelf
 */
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

  /** When cleanup tool is normal-selected on an error entity. */
  onErrorEntityRevived(assembly: AssemblyContent, proxyEntity: LuaEntity, layer: LayerPosition): void

  /** When cleanup tool is alt-selected on a settings remnant entity. */
  onSettingsRemnantDeleted(assembly: AssemblyContent, proxyEntity: LuaEntity, layer: LayerPosition): void
}

/**
 * @noSelf
 */
export interface WorldNotifier {
  createNotification(at: BasicEntityInfo, message: LocalisedString): void
}

export function createAssemblyUpdater(
  worldUpdater: WorldUpdater,
  entitySaver: EntitySaver,
  wireSaver: WireSaver,
  notifier: WorldNotifier,
): AssemblyUpdater {
  const { deleteWorldEntities, updateWorldEntities } = worldUpdater
  const { saveEntity } = entitySaver
  const { getWireConnectionDiff } = wireSaver
  const { createNotification } = notifier

  function recordCircuitWires(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): boolean {
    const [added, removed] = getWireConnectionDiff(assembly, assemblyEntity, layerNumber, entity)
    if (!added) return false
    if (added[0] === nil && removed![0] === nil) return false
    const { content } = assembly
    for (const connection of added) content.addWireConnection(connection)
    for (const connection of removed!) content.removeWireConnection(connection)
    return true
  }

  function onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): AssemblyEntity | nil {
    const position = getLayerPosition(layer, entity)
    const { layerNumber } = layer
    const { content } = assembly

    const existing = content.findCompatible(entity.name, position, entity.direction)
    if (existing) {
      const existingLayer = existing.getBaseLayer()
      if (existingLayer <= layerNumber) {
        entityAddedAbove(assembly, existing, layerNumber, entity)
        return existing
      }
    }

    if (existing) {
      // layerNumber < existing.layerNumber
      entityAddedBelow(assembly, existing, layerNumber, entity)
      return existing
    }

    const saved = saveEntity(entity)
    if (!saved) return
    // add new entity
    const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, layerNumber)
    content.add(assemblyEntity)

    assemblyEntity.replaceWorldEntity(layerNumber, entity)
    recordCircuitWires(assembly, assemblyEntity, layerNumber, entity)
    updateWorldEntities(assembly, assemblyEntity, 1)

    return assemblyEntity
  }

  function updateSingleWorldEntity(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    layerNumber: LayerNumber,
    replace: boolean,
  ): void {
    updateWorldEntities(assembly, assemblyEntity, layerNumber, layerNumber, replace)
  }

  function entityAddedAbove(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): void {
    if (existing.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existing, layerNumber, entity)
    } else {
      updateSingleWorldEntity(assembly, existing, layerNumber, false)
    }
  }

  function entityAddedBelow(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    luaEntity: LuaEntity,
  ): void {
    if (existing.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existing, layerNumber, luaEntity)
    } else {
      moveEntityDown(assembly, existing, layerNumber, luaEntity)
    }
  }

  function reviveSettingsRemnant(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: LayerNumber,
    entity: LuaEntity,
  ): void {
    existing.isSettingsRemnant = nil
    existing.moveToLayer(layerNumber)
    existing.replaceWorldEntity(layerNumber, entity)
    worldUpdater.reviveSettingsRemnant(assembly, existing)
  }

  function moveEntityDown(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    layerNumber: number,
    luaEntity: LuaEntity,
  ): void {
    const oldLayer = existing.moveToLayer(layerNumber, true)
    existing.replaceWorldEntity(layerNumber, luaEntity)
    createNotification(luaEntity, [L_Interaction.EntityMovedFromLayer, assembly.getLayerName(oldLayer)])
    updateWorldEntities(assembly, existing, layerNumber, oldLayer, true)
  }

  function onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, layer: LayerPosition): void {
    const position = getLayerPosition(layer, entity)
    const { content } = assembly

    const existing = content.findCompatible(entity.name, position, entity.direction)
    if (!existing) return
    const { layerNumber } = layer
    const existingLayer = existing.getBaseLayer()

    if (existingLayer !== layerNumber) {
      if (existingLayer < layerNumber) {
        updateSingleWorldEntity(assembly, existing, layerNumber, true)
      }
      // else: layerNumber > existingLayer; bug, ignore
      return
    }
    doEntityDelete(assembly, existing, entity)
  }

  function doEntityDelete(assembly: AssemblyContent, assemblyEntity: AssemblyEntity, entity: BasicEntityInfo): void {
    const oldLayer = assemblyEntity.getOldLayer()
    if (oldLayer !== nil) {
      moveEntityToOldLayer(assembly, assemblyEntity, oldLayer, entity)
    } else if (assemblyEntity.hasLayerChange()) {
      assemblyEntity.isSettingsRemnant = true
      worldUpdater.makeSettingsRemnant(assembly, assemblyEntity)
    } else {
      assembly.content.delete(assemblyEntity)
      deleteWorldEntities(assemblyEntity)
    }
  }

  function moveEntityToOldLayer(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    oldLayer: LayerNumber,
    luaEntity: BasicEntityInfo,
  ): void {
    const currentLayer = existing.getBaseLayer()
    existing.moveToLayer(oldLayer)
    createNotification(luaEntity, [L_Interaction.EntityMovedBackToLayer, assembly.getLayerName(oldLayer)])
    updateWorldEntities(assembly, existing, currentLayer, oldLayer, true)
  }

  function getCompatibleOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    layer: LayerPosition,
    previousDirection?: defines.direction,
  ): AssemblyEntity | nil {
    const position = getLayerPosition(layer, entity)
    const compatible = assembly.content.findCompatible(entity.name, position, previousDirection ?? entity.direction)
    if (compatible && layer.layerNumber >= compatible.getBaseLayer()) {
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
    const isBaseLayer = existing.getBaseLayer() === layerNumber
    const rotateAllowed = rotateTo !== nil && isBaseLayer
    if (rotateAllowed) {
      existing.direction = rotateTo !== 0 ? rotateTo : nil
    }
    // else, direction will be reset by updateWorldEntities

    const newValue = saveEntity(entity)
    if (!newValue) return // bug?
    if (upgradeTo) newValue.name = upgradeTo

    const hasDiff = existing.adjustValueAtLayer(layerNumber, newValue)
    if (rotateAllowed || (hasDiff && isBaseLayer)) {
      // if rotate or upgrade base value, update all layers (including highlights)
      updateWorldEntities(assembly, existing, 1)
    } else if (hasDiff) {
      // update all above layers
      updateWorldEntities(assembly, existing, layerNumber)
    } else if (rotateTo) {
      // rotation forbidden, update only this layer
      updateWorldEntities(assembly, existing, layerNumber, layerNumber)
    }
    // else, no diff, do nothing
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

  function onCircuitWiresPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, layer: LayerPosition): void {
    const existing = getCompatibleOrAdd(assembly, entity, layer)
    if (!existing) return
    if (recordCircuitWires(assembly, existing, layer.layerNumber, entity)) {
      updateWorldEntities(assembly, existing, existing.getBaseLayer())
    }
  }

  function getEntityFromProxyEntity(
    proxyEntity: LuaEntity,
    layer: LayerPosition,
    assembly: AssemblyContent,
  ): AssemblyEntity | nil {
    const proxyName = proxyEntity.name
    assert(proxyName.startsWith(Prototypes.SelectionProxyPrefix))
    const actualName = proxyName.substring(Prototypes.SelectionProxyPrefix.length)

    const position = getLayerPosition(layer, proxyEntity)
    const existing = assembly.content.findCompatible(actualName, position, proxyEntity.direction)
    return existing
  }

  function onErrorEntityRevived(assembly: AssemblyContent, proxyEntity: LuaEntity, layer: LayerPosition): void {
    const existing = getEntityFromProxyEntity(proxyEntity, layer, assembly)
    if (!existing || existing.isSettingsRemnant || layer.layerNumber < existing.getBaseLayer()) return
    updateWorldEntities(assembly, existing, layer.layerNumber, layer.layerNumber)
  }

  function onSettingsRemnantDeleted(assembly: AssemblyContent, proxyEntity: LuaEntity, layer: LayerPosition): void {
    const existing = getEntityFromProxyEntity(proxyEntity, layer, assembly)
    if (!existing || !existing.isSettingsRemnant) return
    assembly.content.delete(existing)
    deleteWorldEntities(existing)
  }

  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
    onEntityMarkedForUpgrade,
    onCircuitWiresPotentiallyUpdated,
    onErrorEntityRevived,
    onSettingsRemnantDeleted,
  }
}

const DefaultWorldNotifier: WorldNotifier = {
  createNotification(at: BasicEntityInfo, message: LocalisedString): void {
    at.surface.create_entity({
      name: "flying-text",
      position: at.position,
      text: message,
    })
  },
}

export const DefaultAssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(
  DefaultWorldUpdater,
  DefaultEntityHandler,
  DefaultWireHandler,
  DefaultWorldNotifier,
)

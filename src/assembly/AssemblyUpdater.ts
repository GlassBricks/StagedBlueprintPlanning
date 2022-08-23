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
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory } from "../entity/entity-info"
import { DefaultEntityHandler, EntitySaver, getStagePosition } from "../entity/EntityHandler"
import { L_Interaction } from "../locale"
import { AssemblyContent, StagePosition } from "./AssemblyContent"
import { DefaultWireHandler, WireSaver } from "./WireHandler"
import { DefaultWorldUpdater, WorldUpdater } from "./WorldUpdater"
import min = math.min

/**
 * Updates assembly in response to world changes.
 *
 * @noSelf
 */
export interface AssemblyUpdater {
  /** Handles when an entity is created. */
  onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void
  /** Handles when an entity is removed. */
  onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void
  /**
   * Handles when an entity has its properties updated.
   * Checks ALL properties except wire connections.
   * Handles rotation (if previousDirection is provided).
   */
  onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection?: defines.direction,
  ): void
  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, and cancels upgrade.
   * Also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void

  onCleanupToolUsed(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityForceDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void
  /** User activated. */
  onMoveEntityToStage(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void
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
  const { deleteWorldEntities, updateWorldEntities, forceDeleteEntity } = worldUpdater
  const { saveEntity } = entitySaver
  const { getWireConnectionDiff } = wireSaver
  const { createNotification } = notifier

  function recordCircuitWires(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    stageNumber: StageNumber,
    entity: LuaEntity,
  ): boolean {
    const [added, removed] = getWireConnectionDiff(assembly, assemblyEntity, stageNumber, entity)
    if (!added) return false
    if (added[0] === nil && removed![0] === nil) return false
    const { content } = assembly
    for (const connection of added) content.addWireConnection(connection)
    for (const connection of removed!) content.removeWireConnection(connection)
    return true
  }

  function onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): AssemblyEntity | nil {
    const position = getStagePosition(stage, entity)
    const { stageNumber } = stage
    const { content } = assembly

    const existing = content.findCompatible(entity.name, position, entity.direction)
    if (existing) {
      const existingStage = existing.getFirstStage()
      if (existingStage <= stageNumber) {
        entityAddedAbove(assembly, existing, stageNumber, entity)
        return existing
      }
    }

    if (existing) {
      // stageNumber < existing.stageNumber
      entityAddedBelow(assembly, existing, stageNumber, entity)
      return existing
    }

    const saved = saveEntity(entity)
    if (!saved) return
    // add new entity
    const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, stageNumber)
    content.add(assemblyEntity)

    assemblyEntity.replaceWorldEntity(stageNumber, entity)
    recordCircuitWires(assembly, assemblyEntity, stageNumber, entity)
    updateWorldEntities(assembly, assemblyEntity, 1)

    return assemblyEntity
  }

  function updateSingleWorldEntity(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    stageNumber: StageNumber,
    replace: boolean,
  ): void {
    updateWorldEntities(assembly, assemblyEntity, stageNumber, stageNumber, replace)
  }

  function entityAddedAbove(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    stageNumber: StageNumber,
    luaEntity: LuaEntity,
  ): void {
    if (existing.isSettingsRemnant) {
      existing.replaceWorldEntity(stageNumber, luaEntity)
      reviveSettingsRemnant(assembly, existing, stageNumber)
    } else {
      updateSingleWorldEntity(assembly, existing, stageNumber, false)
    }
  }

  function entityAddedBelow(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    stageNumber: StageNumber,
    luaEntity: LuaEntity,
  ): void {
    if (existing.isSettingsRemnant) {
      existing.replaceWorldEntity(stageNumber, luaEntity)
      reviveSettingsRemnant(assembly, existing, stageNumber)
    } else {
      moveEntityDown(assembly, existing, stageNumber, luaEntity)
    }
  }

  function reviveSettingsRemnant(assembly: AssemblyContent, existing: AssemblyEntity, stageNumber: StageNumber): void {
    existing.isSettingsRemnant = nil
    existing.moveToStage(stageNumber)
    worldUpdater.reviveSettingsRemnant(assembly, existing)
  }

  function moveEntityDown(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    stageNumber: number,
    luaEntity: LuaEntity,
  ): void {
    const oldStage = existing.moveToStage(stageNumber, true)
    createNotification(luaEntity, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)])
    existing.replaceWorldEntity(stageNumber, luaEntity)
    updateWorldEntities(assembly, existing, stageNumber, oldStage, true)
  }

  function onEntityDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void {
    const position = getStagePosition(stage, entity)
    const { content } = assembly

    const existing = content.findCompatible(entity.name, position, entity.direction)
    if (!existing) return
    const { stageNumber } = stage
    const existingStage = existing.getFirstStage()

    if (existingStage !== stageNumber) {
      if (existingStage < stageNumber) {
        updateSingleWorldEntity(assembly, existing, stageNumber, true)
      }
      // else: stageNumber > existingStage; bug, ignore
      return
    }
    doEntityDelete(assembly, existing, entity)
  }

  function doEntityDelete(assembly: AssemblyContent, assemblyEntity: AssemblyEntity, entity: BasicEntityInfo): void {
    const oldStage = assemblyEntity.getOldStage()
    if (oldStage !== nil) {
      moveEntityToOldStage(assembly, assemblyEntity, oldStage, entity)
    } else if (assemblyEntity.hasStageDiff()) {
      assemblyEntity.isSettingsRemnant = true
      worldUpdater.makeSettingsRemnant(assembly, assemblyEntity)
    } else {
      assembly.content.delete(assemblyEntity)
      deleteWorldEntities(assemblyEntity)
    }
  }

  function moveEntityToOldStage(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    oldStage: StageNumber,
    luaEntity: BasicEntityInfo,
  ): void {
    const currentStage = existing.getFirstStage()
    existing.moveToStage(oldStage)
    createNotification(luaEntity, [L_Interaction.EntityMovedBackToStage, assembly.getStageName(oldStage)])
    updateWorldEntities(assembly, existing, currentStage, oldStage)
  }

  function onEntityForceDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void {
    const existing = assembly.content.findCompatible(entity.name, getStagePosition(stage, entity), entity.direction)
    if (existing) {
      forceDeleteEntity(assembly, existing, stage.stageNumber)
    }
  }

  function getCompatibleOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection?: defines.direction,
  ): AssemblyEntity | nil {
    const position = getStagePosition(stage, entity)
    const compatible = assembly.content.findCompatible(entity.name, position, previousDirection ?? entity.direction)
    if (compatible && stage.stageNumber >= compatible.getFirstStage()) {
      compatible.replaceWorldEntity(stage.stageNumber, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, stage)
    }
    return compatible
  }

  function doUpdate(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stageNumber: number,
    existing: AssemblyEntity,
    rotateTo: defines.direction | nil,
    upgradeTo?: string | nil,
  ): void {
    const isFirstStage = existing.getFirstStage() === stageNumber
    const rotateAllowed = rotateTo !== nil && isFirstStage
    if (rotateAllowed) {
      existing.direction = rotateTo !== 0 ? rotateTo : nil
    }
    // else, direction will be reset by updateWorldEntities

    const newValue = saveEntity(entity)
    if (!newValue) return // bug?
    if (upgradeTo) newValue.name = upgradeTo

    const hasDiff = existing.adjustValueAtStage(stageNumber, newValue)
    if (rotateAllowed || (hasDiff && isFirstStage)) {
      // if rotate or upgrade first value, update all stages (including highlights)
      updateWorldEntities(assembly, existing, 1)
    } else if (hasDiff) {
      // update all above stages
      updateWorldEntities(assembly, existing, stageNumber)
    } else if (rotateTo) {
      // rotation forbidden, update only this stage
      updateWorldEntities(assembly, existing, stageNumber, stageNumber)
    }
    // else, no diff, do nothing
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection?: defines.direction,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection)
    if (!existing) return

    const rotation = previousDirection && previousDirection !== entity.direction ? entity.direction : nil
    doUpdate(assembly, entity, stage.stageNumber, existing, rotation)
  }

  function onEntityMarkedForUpgrade(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage)
    if (!existing) return

    const upgradeDirection = entity.get_upgrade_direction()
    let upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      if (getEntityCategory(upgradeType) !== existing.categoryName) {
        game.print(
          `BUG: incompatible upgrade type to ${upgradeType}: category ${getEntityCategory(
            upgradeType,
          )}, existing category: ${existing.categoryName}`,
        )
        upgradeType = nil
      }
    }
    if (upgradeDirection || upgradeType) {
      doUpdate(assembly, entity, stage.stageNumber, existing, upgradeDirection, upgradeType)
    }
    if (entity.valid) entity.cancel_upgrade("player")
  }

  function onCircuitWiresPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage)
    if (!existing) return
    if (recordCircuitWires(assembly, existing, stage.stageNumber, entity)) {
      updateWorldEntities(assembly, existing, existing.getFirstStage())
    }
  }

  function getEntityFromProxyEntity(
    proxyEntity: LuaEntity,
    stage: StagePosition,
    assembly: AssemblyContent,
  ): AssemblyEntity | nil {
    const proxyName = proxyEntity.name
    assert(proxyName.startsWith(Prototypes.SelectionProxyPrefix))
    const actualName = proxyName.substring(Prototypes.SelectionProxyPrefix.length)

    const position = getStagePosition(stage, proxyEntity)
    const existing = assembly.content.findCompatible(actualName, position, proxyEntity.direction)
    return existing
  }

  function onCleanupToolUsed(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void {
    const existing = getEntityFromProxyEntity(proxyEntity, stage, assembly)
    if (!existing) return
    if (!existing.isSettingsRemnant) {
      // this is an error entity, try revive
      if (stage.stageNumber < existing.getFirstStage()) return
      updateWorldEntities(assembly, existing, stage.stageNumber, stage.stageNumber)
    } else {
      // settings remnant, remove
      assembly.content.delete(existing)
      deleteWorldEntities(existing)
    }
  }

  function getEntityFromPreviewEntity(
    entityOrPreviewEntity: LuaEntity,
    stage: StagePosition,
    assembly: AssemblyContent,
  ): AssemblyEntity | nil {
    let name = entityOrPreviewEntity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) name = name.substring(Prototypes.PreviewEntityPrefix.length)
    const position = getStagePosition(stage, entityOrPreviewEntity)
    const existing = assembly.content.findCompatible(name, position, entityOrPreviewEntity.direction)
    return existing
  }

  function onMoveEntityToStage(
    assembly: AssemblyContent,
    entityOrPreviewEntity: LuaEntity,
    stage: StagePosition,
  ): void {
    const existing = getEntityFromPreviewEntity(entityOrPreviewEntity, stage, assembly)
    if (!existing) return
    const { stageNumber } = stage
    if (existing.isSettingsRemnant) {
      // revive at current stage
      reviveSettingsRemnant(assembly, existing, stageNumber)
    } else {
      // move
      const oldStage = existing.moveToStage(stageNumber, true)
      updateWorldEntities(assembly, existing, min(oldStage, stageNumber))
      createNotification(entityOrPreviewEntity, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)])
    }
  }

  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
    onEntityMarkedForUpgrade,
    onCircuitWiresPotentiallyUpdated,
    onCleanupToolUsed,
    onEntityForceDeleted,
    onMoveEntityToStage,
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

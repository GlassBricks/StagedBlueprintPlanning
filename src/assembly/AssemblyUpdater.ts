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
import { getSavedDirection, UndergroundBeltEntity } from "../entity/undergrounds"
import { L_Interaction } from "../locale"
import { AssemblyUndergroundEntity, findUndergroundPair } from "./assembly-undergrounds"
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
   * Does not handle wires.
   * If previousDirection is specified, also checks for rotation.
   */
  onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection?: defines.direction,
  ): void

  /** Handles when an entity is rotated by player. */
  onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection: defines.direction,
  ): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void

  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void

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

    let existing = content.findCompatibleAnyDirection(entity.name, position)
    if (existing && existing.getWorldEntity(stage.stageNumber) !== nil) {
      // if there is an existing entity at the layer, it must match direction this time
      existing = content.findCompatible(entity, position, nil)
    }

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

    const [saved, savedDir] = saveEntity(entity)
    if (!saved) return
    // add new entity
    const assemblyEntity = createAssemblyEntity(saved, position, savedDir, stageNumber)
    assemblyEntity.replaceWorldEntity(stageNumber, entity)
    content.add(assemblyEntity)

    if (entity.type === "underground-belt") {
      const [pair] = findUndergroundPair(assembly.content, assemblyEntity as AssemblyUndergroundEntity)
      if (pair) {
        const otherDir = pair.getFirstValue().type
        ;(assemblyEntity as AssemblyUndergroundEntity).setUndergroundBeltDirection(
          otherDir === "output" ? "input" : "output",
        )
      }
    }

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

    const existing = content.findCompatible(entity, position, nil)
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
    const existing = assembly.content.findCompatible(entity, getStagePosition(stage, entity), nil)
    if (existing) {
      forceDeleteEntity(assembly, existing, stage.stageNumber)
    }
  }

  /** Also asserts that stageNumber > entity's first stage. */
  function getCompatibleOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection?: defines.direction,
  ): AssemblyEntity | nil {
    const position = getStagePosition(stage, entity)
    const compatible = assembly.content.findCompatible(entity, position, previousDirection)
    if (compatible && stage.stageNumber >= compatible.getFirstStage()) {
      compatible.replaceWorldEntity(stage.stageNumber, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, stage)
    }
    return compatible
  }

  /**
   * Undoes rotation if rotation failed.
   */
  function tryRotateOrUndo(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: AssemblyEntity,
    newDirection: defines.direction,
  ): boolean {
    const rotateAllowed = stage.stageNumber === existing.getFirstStage()
    if (rotateAllowed) {
      existing.direction = newDirection === 0 ? nil : newDirection
    } else {
      createNotification(entity, [L_Interaction.CannotRotateEntity])
      updateSingleWorldEntity(assembly, existing, stage.stageNumber, false)
    }
    return rotateAllowed
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection?: defines.direction,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection)
    if (!existing) return

    const [newValue, direction] = saveEntity(entity)
    assert(newValue, "could not save value on existing entity")

    const hasRotation = previousDirection !== nil && previousDirection !== direction
    if (hasRotation) {
      const newDirection = entity.direction
      if (!tryRotateOrUndo(assembly, entity, stage, existing, newDirection)) {
        // don't update other stuff if rotation failed
        return
      }
    }

    const hasDiff = existing.adjustValueAtStage(stage.stageNumber, newValue)
    if (hasDiff || hasRotation) {
      updateWorldEntities(assembly, existing, stage.stageNumber)
    }
  }

  function onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection: defines.direction,
  ): void {
    // todo: handle rotation of preview entities?
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltRotated(assembly, entity, stage, existing as AssemblyEntity<UndergroundBeltEntity>)
    }

    const newDirection = entity.direction
    if (tryRotateOrUndo(assembly, entity, stage, existing, newDirection)) {
      // update all entities
      updateWorldEntities(assembly, existing, 1)
    }
  }

  function onUndergroundBeltRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: AssemblyEntity<UndergroundBeltEntity>,
  ): void {
    const actualDirection = getSavedDirection(entity)
    assert(actualDirection === (existing.direction ?? 0), "underground belt direction mismatch with saved state")
    const oldDir = existing.getFirstValue().type
    const newDir = entity.belt_to_ground_type
    if (oldDir === newDir) return

    const { stageNumber } = stage
    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)

    const rotateAllowed =
      !hasMultiple &&
      stageNumber === (pair ? min(existing.getFirstStage(), pair.getFirstStage()) : existing.getFirstStage())

    if (rotateAllowed) {
      existing.setUndergroundBeltDirection(newDir)
      updateWorldEntities(assembly, existing, stageNumber)
      if (pair) {
        pair.setUndergroundBeltDirection(newDir === "output" ? "input" : "output")
        updateWorldEntities(assembly, pair, stageNumber)
      }
    } else {
      createNotification(
        entity,
        hasMultiple
          ? [L_Interaction.CannotFlipUndergroundDueToMultiplePairs]
          : pair && existing.getFirstStage() === stageNumber
          ? [L_Interaction.CannotFlipUndergroundDueToPairInLowerStage]
          : [L_Interaction.CannotRotateEntity],
      )
      updateSingleWorldEntity(assembly, existing, stageNumber, false)
    }
  }

  function onEntityMarkedForUpgrade(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage)
    if (!existing) return

    const rotated = entity.get_upgrade_direction()
    if (rotated) {
      if (!tryRotateOrUndo(assembly, entity, stage, existing, rotated)) {
        // don't update other stuff if rotation failed
        if (entity.valid) entity.cancel_upgrade(entity.force)
        return
      }
    }
    let upgraded = false
    const upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      if (getEntityCategory(upgradeType) !== existing.categoryName) {
        error(
          ` incompatible upgrade type to ${upgradeType}: category ${getEntityCategory(
            upgradeType,
          )}, existing category: ${existing.categoryName}`,
        )
      }
      upgraded = existing.applyUpgradeAtStage(stage.stageNumber, upgradeType)
    }
    if (rotated || upgraded) {
      updateWorldEntities(assembly, existing, stage.stageNumber)
    }
    if (entity.valid) entity.cancel_upgrade(entity.force)
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
    const existing = assembly.content.findCompatibleBasic(actualName, position, proxyEntity.direction)
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
    const position = getStagePosition(stage, entityOrPreviewEntity)
    const name = entityOrPreviewEntity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return assembly.content.findCompatibleBasic(name.substring(Prototypes.PreviewEntityPrefix.length), position, nil)
    }
    return assembly.content.findCompatible(entityOrPreviewEntity, position, nil)
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
    onEntityRotated,
    onCircuitWiresPotentiallyUpdated,
    onEntityMarkedForUpgrade,
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

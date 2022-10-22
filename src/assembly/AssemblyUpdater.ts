/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  AssemblyEntity,
  createAssemblyEntity,
  SavedDirection,
  StageNumber,
  UndergroundBeltAssemblyEntity,
} from "../entity/AssemblyEntity"
import { fixEmptyControlBehavior, hasControlBehaviorSet } from "../entity/empty-control-behavior"
import { Entity } from "../entity/Entity"
import { areUpgradeable } from "../entity/entity-info"
import { EntityHandler, EntitySaver } from "../entity/EntityHandler"
import { getSavedDirection } from "../entity/special-entities"
import { findUndergroundPair } from "../entity/special-entity-treatment"
import { WireHandler, WireSaver } from "../entity/WireHandler"
import { AssemblyData } from "./AssemblyDef"
import { AssemblyEntityDollyResult, WorldUpdater } from "./WorldUpdater"
import min = math.min

/**
 * @noSelf
 */
export interface AssemblyUpdater {
  addNewEntity<T extends Entity = Entity>(
    assembly: AssemblyData,
    stage: StageNumber,
    entitySource: LuaEntity,
  ): AssemblyEntity<T> | nil

  refreshEntityAtStage(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void

  refreshEntityAllStages(assembly: AssemblyData, entity: AssemblyEntity): void

  /** Returns nil if not a lower stage number, else returns the old stage. */
  moveEntityOnPreviewReplace(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): StageNumber | nil

  reviveSettingsRemnant(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): boolean

  disallowEntityDeletion(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void

  deleteEntityOrCreateSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity): void

  forceDeleteEntity(assembly: AssemblyData, entity: AssemblyEntity): void

  /** Replaces entity with an error highlight */
  clearEntityAtStage(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void

  tryUpdateEntityFromWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult

  tryRotateEntityToMatchWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityRotateResult

  /** Doesn't cancel upgrade */
  tryApplyUpgradeTarget(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult

  updateWiresFromWorld(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): WireUpdateResult

  tryDollyEntity(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): AssemblyEntityDollyResult
  moveEntityToStage(assembly: AssemblyData, newStage: StageNumber, entity: AssemblyEntity): StageMoveResult
}
export type UpdateSuccess = "updated" | "no-change"
export type RotateError = "cannot-rotate" | "cannot-flip-multi-pair-underground"
export type UpdateError =
  | RotateError
  | "cannot-upgrade-multi-pair-underground"
  | "cannot-create-pair-upgrade"
  | "cannot-upgrade-changed-pair"
export type EntityRotateResult = UpdateSuccess | RotateError
export type EntityUpdateResult = UpdateSuccess | UpdateError | RotateError
export type WireUpdateResult = UpdateSuccess | "max-connections-exceeded"
export type StageMoveResult = UpdateSuccess | "settings-remnant-revived" | "cannot-move-upgraded-underground"

export function createAssemblyUpdater(
  worldUpdater: WorldUpdater,
  entitySaver: EntitySaver,
  wireSaver: WireSaver,
): AssemblyUpdater {
  const { updateWorldEntities } = worldUpdater
  const { saveEntity } = entitySaver
  const { saveWireConnections } = wireSaver

  function addNewEntity(assembly: AssemblyData, stage: StageNumber, entity: LuaEntity): AssemblyEntity<any> | nil {
    const [saved, savedDir] = saveEntity(entity)
    if (!saved) return nil
    const { content } = assembly
    const assemblyEntity = createAssemblyEntity(saved, entity.position, savedDir, stage)
    assemblyEntity.replaceWorldEntity(stage, entity)
    content.add(assemblyEntity)

    if (entity.type === "underground-belt") {
      // match direction with underground pair
      const [pair] = findUndergroundPair(content, assemblyEntity as UndergroundBeltAssemblyEntity)
      if (pair) {
        const otherDir = pair.firstValue.type
        ;(assemblyEntity as UndergroundBeltAssemblyEntity).setUndergroundBeltDirection(
          otherDir === "output" ? "input" : "output",
        )
      }
    }

    saveWireConnections(content, assemblyEntity, stage)
    updateWorldEntities(assembly, assemblyEntity, 1)

    return assemblyEntity
  }

  function refreshEntityAtStage(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void {
    return updateWorldEntities(assembly, entity, stage, stage, false)
  }

  function refreshEntityAllStages(assembly: AssemblyData, entity: AssemblyEntity): void {
    return updateWorldEntities(assembly, entity, 1, nil, false)
  }

  function moveEntityOnPreviewReplace(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
  ): StageNumber | nil {
    if (stage >= entity.firstStage) return nil
    const oldStage = entity.moveToStage(stage)
    updateWorldEntities(assembly, entity, stage, oldStage)
    return oldStage
  }

  function reviveSettingsRemnant(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): boolean {
    if (!entity.isSettingsRemnant) return false
    entity.isSettingsRemnant = nil
    entity.moveToStage(stage)
    worldUpdater.reviveSettingsRemnant(assembly, entity)
    return true
  }

  function disallowEntityDeletion(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void {
    return updateWorldEntities(assembly, entity, stage, stage, true)
  }

  function shouldMakeSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity) {
    if (entity.hasStageDiff()) return true
    const connections = assembly.content.getCircuitConnections(entity)
    if (!connections) return false
    const stage = entity.firstStage
    for (const [otherEntity] of connections) {
      if (otherEntity.getWorldEntity(stage) === nil) {
        // has a connection at first stage, but not one in the world
        return true
      }
    }
    return false
  }

  function deleteEntityOrCreateSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity): void {
    if (shouldMakeSettingsRemnant(assembly, entity)) {
      entity.isSettingsRemnant = true
      worldUpdater.makeSettingsRemnant(assembly, entity)
    } else {
      assembly.content.delete(entity)
      worldUpdater.deleteAllEntities(entity)
    }
  }

  function forceDeleteEntity(assembly: AssemblyData, entity: AssemblyEntity): void {
    assembly.content.delete(entity)
    worldUpdater.deleteAllEntities(entity)
  }

  function undoRotate(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity) {
    refreshEntityAtStage(assembly, stage, entity)
  }

  function setRotationOrUndo(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    newDirection: SavedDirection,
  ): boolean {
    const rotateAllowed = stage === entity.firstStage
    if (rotateAllowed) {
      entity.setDirection(newDirection)
      // todo: wu rotation separate
    } else {
      undoRotate(assembly, stage, entity)
    }
    return rotateAllowed
  }

  function tryUpdateEntityFromWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult {
    if (entitySource.type === "underground-belt") {
      return tryUpdateUndergroundFromFastReplace(assembly, stage, entity, entitySource)
    }

    const newDirection = entitySource.direction as SavedDirection
    const rotated = newDirection !== entity.getDirection()
    if (rotated) {
      if (!setRotationOrUndo(assembly, stage, entity, newDirection)) {
        return "cannot-rotate"
      }
    }
    const hasDiff = doUpdateEntityFromWorld(assembly, stage, entity, entitySource)
    if (hasDiff || rotated) {
      updateWorldEntities(assembly, entity, stage)
      return "updated"
    }
    return "no-change"
  }

  function doUpdateEntityFromWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): boolean {
    entity.replaceWorldEntity(stage, entitySource)
    const worldEntity = assert(entity.getWorldEntity(stage))
    const [newValue, newDirection] = saveEntity(worldEntity)
    if (!newValue) return false
    assert(newDirection === entity.getDirection(), "direction mismatch on saved entity")
    const hasDiff = entity.adjustValueAtStage(stage, newValue)
    return hasDiff
  }

  function tryRotateEntityFromWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityRotateResult {
    if (entitySource.type === "underground-belt") {
      return tryRotateUnderground(assembly, stage, entity as UndergroundBeltAssemblyEntity, entitySource)
    }

    const newDirection = entitySource.direction as SavedDirection
    const rotated = newDirection !== entity.getDirection()
    if (!rotated) return "no-change"
    if (setRotationOrUndo(assembly, stage, entity, newDirection)) {
      updateWorldEntities(assembly, entity, stage)
      return "updated"
    }
    return "cannot-rotate"
  }

  function checkUpgradeType(existing: AssemblyEntity, upgradeType: string): void {
    if (!areUpgradeable(existing.firstValue.name, upgradeType))
      error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
  }

  function tryUpgradeEntityFromWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult {
    if (entitySource.type === "underground-belt") {
      return tryUpgradeUndergroundBeltFromWorld(assembly, stage, entity as UndergroundBeltAssemblyEntity, entitySource)
    }

    const rotateDir = entitySource.get_upgrade_direction() as SavedDirection | nil
    const rotated = rotateDir !== nil && rotateDir !== entity.getDirection()
    if (rotated) {
      if (!setRotationOrUndo(assembly, stage, entity, rotateDir)) {
        // don't update other stuff if rotation failed
        return "cannot-rotate"
      }
    }

    let upgraded = false
    const upgradeType = entitySource.get_upgrade_target()?.name
    if (upgradeType) {
      checkUpgradeType(entity, upgradeType)
      upgraded = entity.applyUpgradeAtStage(stage, upgradeType)
    }
    if (rotated || upgraded) {
      updateWorldEntities(assembly, entity, stage)
      return "updated"
    }
    return "no-change"
  }

  function tryUpdateUndergroundFromFastReplace(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult {
    // only can upgrade via fast-replace
    const newType = entitySource.name
    if (newType === entity.getNameAtStage(stage)) return "no-change"

    const result = tryUpgradeUndergroundBelt(assembly, stage, entity as UndergroundBeltAssemblyEntity, newType)
    if (result !== "no-change" && result !== "updated") {
      refreshEntityAtStage(assembly, stage, entity)
    }
    return result
  }

  function tryRotateUnderground(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: UndergroundBeltAssemblyEntity,
    entitySource: LuaEntity,
  ): EntityRotateResult {
    const actualDirection = getSavedDirection(entitySource)
    assert(actualDirection === entity.getDirection(), "underground belt direction mismatch with saved direction")
    const oldDir = entity.firstValue.type
    const newDir = entitySource.belt_to_ground_type
    if (oldDir === newDir) return "no-change"

    const [pair, hasMultiple] = findUndergroundPair(assembly.content, entity)

    if (hasMultiple) {
      undoRotate(assembly, stage, entity)
      return "cannot-flip-multi-pair-underground"
    }
    const isFirstStage = entity.firstStage === stage || (pair && pair.firstStage === stage)
    if (!isFirstStage) {
      undoRotate(assembly, stage, entity)
      return "cannot-rotate"
    }

    // do rotate
    entity.setUndergroundBeltDirection(newDir)
    updateWorldEntities(assembly, entity, entity.firstStage)
    if (pair) {
      pair.setUndergroundBeltDirection(newDir === "output" ? "input" : "output")
      updateWorldEntities(assembly, pair, pair.firstStage)
    }
    return "updated"
  }

  function tryUpgradeUndergroundBeltFromWorld(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: UndergroundBeltAssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult {
    const upgradeType = entitySource.get_upgrade_target()?.name
    if (!upgradeType) {
      return "no-change"
    }
    checkUpgradeType(entity, upgradeType)
    return tryUpgradeUndergroundBelt(assembly, stage, entity, upgradeType)
  }

  function tryUpgradeUndergroundBelt(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: UndergroundBeltAssemblyEntity,
    upgradeType: string,
  ): EntityUpdateResult {
    const [pair, hasMultiple] = findUndergroundPair(assembly.content, entity)
    if (hasMultiple) {
      return "cannot-upgrade-multi-pair-underground"
    }
    let isFirstStage = entity.firstStage === stage
    if (pair) {
      isFirstStage ||= pair.firstStage === stage
      if (!isFirstStage && entity.firstStage !== pair.firstStage) {
        // createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
        return "cannot-create-pair-upgrade"
      }
    }
    const oldName = entity.firstValue.name
    const applyStage = isFirstStage ? entity.firstStage : stage
    const upgraded = entity.applyUpgradeAtStage(applyStage, upgradeType)
    if (!upgraded) return "no-change"

    if (!pair) {
      updateWorldEntities(assembly, entity, applyStage)
    } else {
      const pairStage = isFirstStage ? pair.firstStage : stage
      const pairUpgraded = pair.applyUpgradeAtStage(pairStage, upgradeType)
      // check pair still correct
      const [newPair, newMultiple] = findUndergroundPair(assembly.content, entity)
      if (newPair !== pair || newMultiple) {
        entity.applyUpgradeAtStage(applyStage, oldName)
        pair.applyUpgradeAtStage(pairStage, oldName)
        return "cannot-upgrade-changed-pair"
      }

      updateWorldEntities(assembly, entity, applyStage)
      if (pairUpgraded) updateWorldEntities(assembly, pair, pairStage)
    }
    return "updated"
  }

  function updateWiresFromWorld(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): WireUpdateResult {
    const [connectionsChanged, maxConnectionsExceeded] = saveWireConnections(assembly.content, entity, stage)
    if (maxConnectionsExceeded) {
      updateWorldEntities(assembly, entity, entity.firstStage)
      return "max-connections-exceeded"
    }
    if (!connectionsChanged) return "no-change"

    const circuitConnections = assembly.content.getCircuitConnections(entity)
    if (circuitConnections) {
      checkDefaultControlBehavior(assembly, entity, stage)
      for (const [otherEntity] of circuitConnections) {
        checkDefaultControlBehavior(assembly, otherEntity, stage)
      }
    }
    updateWorldEntities(assembly, entity, entity.firstStage)
    return "updated"
  }

  function checkDefaultControlBehavior(assembly: AssemblyData, entity: AssemblyEntity, stage: StageNumber): void {
    if (!hasControlBehaviorSet(entity, stage)) {
      fixEmptyControlBehavior(entity)
      const entitySource = assert(entity.getWorldEntity(stage), "Could not find circuit connected entity")[0]
      doUpdateEntityFromWorld(assembly, stage, entity, entitySource)
    }
  }

  function moveEntityToStage(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): StageMoveResult {
    if (entity.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, stage, entity)
      return "settings-remnant-revived"
    }
    const oldStage = entity.firstStage
    if (oldStage === stage) return "no-change"

    if (entity.isUndergroundBelt() && entity.hasStageDiff()) {
      return "cannot-move-upgraded-underground"
    }

    // move
    entity.moveToStage(stage)
    updateWorldEntities(assembly, entity, min(oldStage, stage))
    return "updated"
  }

  return {
    addNewEntity,
    refreshEntityAtStage,
    refreshEntityAllStages,
    moveEntityOnPreviewReplace,
    tryDollyEntity: worldUpdater.tryMoveEntity,
    disallowEntityDeletion,
    deleteEntityOrCreateSettingsRemnant,
    forceDeleteEntity,
    reviveSettingsRemnant,
    clearEntityAtStage: worldUpdater.clearWorldEntity,
    tryUpdateEntityFromWorld,
    tryRotateEntityToMatchWorld: tryRotateEntityFromWorld,
    tryApplyUpgradeTarget: tryUpgradeEntityFromWorld,
    updateWiresFromWorld,
    moveEntityToStage,
  }
}

export const AssemblyUpdater = createAssemblyUpdater(WorldUpdater, EntityHandler, WireHandler)

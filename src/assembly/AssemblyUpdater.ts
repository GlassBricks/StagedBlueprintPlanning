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
  RollingStockAssemblyEntity,
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
import { Assembly } from "./AssemblyDef"
import { AssemblyEntityDollyResult, WorldUpdater } from "./WorldUpdater"
import min = math.min

/**
 * @noSelf
 */
export interface AssemblyUpdater {
  addNewEntity<T extends Entity = Entity>(
    assembly: Assembly,
    entitySource: LuaEntity,
    stage: StageNumber,
  ): AssemblyEntity<T> | nil

  refreshEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void

  refreshEntityAllStages(assembly: Assembly, entity: AssemblyEntity): void

  /** Returns nil if not a lower stage number, else returns the old stage. */
  moveEntityOnPreviewReplace(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): StageNumber | nil

  forbidEntityDeletion(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void

  deleteEntityOrCreateSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean

  forceDeleteEntity(assembly: Assembly, entity: AssemblyEntity): void

  /** Replaces entity with an error highlight */
  clearEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void

  tryUpdateEntityFromWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): EntityUpdateResult

  tryRotateEntityToMatchWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): EntityRotateResult

  /** Doesn't cancel upgrade */
  tryApplyUpgradeTarget(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): EntityUpdateResult

  updateWiresFromWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): WireUpdateResult

  tryDollyEntity(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): AssemblyEntityDollyResult
  moveEntityToStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): StageMoveResult

  resetStage(assembly: Assembly, stage: StageNumber): void

  resetProp<T extends Entity>(assembly: Assembly, entity: AssemblyEntity<T>, stage: StageNumber, prop: keyof T): boolean
  movePropDown<T extends Entity>(
    assembly: Assembly,
    entity: AssemblyEntity<T>,
    stage: StageNumber,
    prop: keyof T,
  ): boolean

  resetAllProps(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean
  moveAllPropsDown(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean

  resetTrain(assembly: Assembly, entity: RollingStockAssemblyEntity): void
  setTrainLocationToCurrent(assembly: Assembly, entity: RollingStockAssemblyEntity): void
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
  const {
    updateWorldEntities,
    refreshWorldEntityAtStage,
    replaceWorldEntityAtStage,
    makeSettingsRemnant,
    deleteAllEntities,
    updateNewEntityWithoutWires,
    updateWireConnections,
  } = worldUpdater
  const { saveEntity } = entitySaver
  const { saveWireConnections } = wireSaver

  function reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): boolean {
    if (!entity.isSettingsRemnant) return false
    entity.isSettingsRemnant = nil
    entity.moveToStage(stage)
    worldUpdater.reviveSettingsRemnant(assembly, entity)
    return true
  }

  function shouldMakeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity) {
    if (entity.inFirstStageOnly()) return false
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

  function undoRotate(assembly: Assembly, stage: StageNumber, entity: AssemblyEntity) {
    refreshWorldEntityAtStage(assembly, entity, stage)
  }

  function setRotationOrUndo(
    assembly: Assembly,
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

  function doUpdateEntityFromWorld(
    assembly: Assembly,
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

  function checkUpgradeType(existing: AssemblyEntity, upgradeType: string): void {
    if (!areUpgradeable(existing.firstValue.name, upgradeType))
      error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
  }

  function tryUpdateUndergroundFromFastReplace(
    assembly: Assembly,
    stage: StageNumber,
    entity: AssemblyEntity,
    entitySource: LuaEntity,
  ): EntityUpdateResult {
    // only can upgrade via fast-replace
    const newType = entitySource.name
    if (newType === entity.getNameAtStage(stage)) return "no-change"

    const result = tryUpgradeUndergroundBelt(assembly, stage, entity as UndergroundBeltAssemblyEntity, newType)
    if (result !== "no-change" && result !== "updated") {
      refreshWorldEntityAtStage(assembly, entity, stage)
    }
    return result
  }

  function tryRotateUnderground(
    assembly: Assembly,
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
    assembly: Assembly,
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
    assembly: Assembly,
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

  function checkDefaultControlBehavior(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
    if (!hasControlBehaviorSet(entity, stage)) {
      fixEmptyControlBehavior(entity)
      const entitySource = assert(entity.getWorldEntity(stage), "Could not find circuit connected entity")[0]
      doUpdateEntityFromWorld(assembly, stage, entity, entitySource)
    }
  }

  return {
    addNewEntity(assembly: Assembly, entity: LuaEntity, stage: StageNumber): AssemblyEntity<any> | nil {
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

      updateNewEntityWithoutWires(assembly, assemblyEntity)
      saveWireConnections(content, assemblyEntity, stage, assembly.numStages())
      updateWireConnections(assembly, assemblyEntity)

      return assemblyEntity
    },
    refreshEntityAtStage: refreshWorldEntityAtStage,
    refreshEntityAllStages(assembly: Assembly, entity: AssemblyEntity): void {
      return updateWorldEntities(assembly, entity, 1)
    },
    moveEntityOnPreviewReplace(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): StageNumber | nil {
      if (stage >= entity.firstStage) return nil
      const oldStage = entity.moveToStage(stage)
      updateWorldEntities(assembly, entity, stage, oldStage)
      return oldStage
    },
    tryDollyEntity: worldUpdater.tryDollyEntities,
    forbidEntityDeletion: replaceWorldEntityAtStage,
    deleteEntityOrCreateSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
      if (shouldMakeSettingsRemnant(assembly, entity)) {
        entity.isSettingsRemnant = true
        makeSettingsRemnant(assembly, entity)
      } else {
        assembly.content.delete(entity)
        deleteAllEntities(entity)
      }
    },
    forceDeleteEntity(assembly: Assembly, entity: AssemblyEntity): void {
      assembly.content.delete(entity)
      deleteAllEntities(entity)
    },
    reviveSettingsRemnant,
    clearEntityAtStage: worldUpdater.clearWorldEntity,
    tryUpdateEntityFromWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): EntityUpdateResult {
      const entitySource = entity.getWorldEntity(stage)
      if (!entitySource) return "no-change"
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
    },
    tryRotateEntityToMatchWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): EntityRotateResult {
      const entitySource = entity.getWorldEntity(stage)
      if (!entitySource) return "no-change"
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
    },
    tryApplyUpgradeTarget(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): EntityUpdateResult {
      const entitySource = entity.getWorldEntity(stage)
      if (!entitySource) return "no-change"
      if (entitySource.type === "underground-belt") {
        return tryUpgradeUndergroundBeltFromWorld(
          assembly,
          stage,
          entity as UndergroundBeltAssemblyEntity,
          entitySource,
        )
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
    },
    updateWiresFromWorld(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): WireUpdateResult {
      const [connectionsChanged, maxConnectionsExceeded] = saveWireConnections(assembly.content, entity, stage, stage)
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
    },
    moveEntityToStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): StageMoveResult {
      if (entity.isSettingsRemnant) {
        reviveSettingsRemnant(assembly, entity, stage)
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
    },
    resetStage(assembly: Assembly, stageNumber: StageNumber) {
      const stage = assembly.getStage(stageNumber)
      if (!stage) return
      worldUpdater.clearStage(stage)
      const updateLater: RollingStockAssemblyEntity[] = []
      for (const entity of assembly.content.iterateAllEntities()) {
        if (entity.isRollingStock()) {
          updateLater.push(entity)
        } else {
          refreshWorldEntityAtStage(assembly, entity, stageNumber)
        }
      }
      for (const entity of updateLater) {
        refreshWorldEntityAtStage(assembly, entity, stageNumber)
      }
    },
    resetProp<T extends Entity>(
      assembly: Assembly,
      entity: AssemblyEntity<T>,
      stageNumber: StageNumber,
      prop: keyof T,
    ): boolean {
      const moved = entity.resetProp(stageNumber, prop)
      if (moved) updateWorldEntities(assembly, entity, stageNumber)
      return moved
    },
    movePropDown<T extends Entity>(
      assembly: Assembly,
      entity: AssemblyEntity<T>,
      stageNumber: StageNumber,
      prop: keyof T,
    ): boolean {
      const movedStage = entity.movePropDown(stageNumber, prop)
      if (movedStage) {
        updateWorldEntities(assembly, entity, movedStage)
        return true
      }
      return false
    },
    resetAllProps(assembly: Assembly, entity: AssemblyEntity, stageNumber: StageNumber): boolean {
      const moved = entity.resetValue(stageNumber)
      if (moved) updateWorldEntities(assembly, entity, stageNumber)
      return moved
    },
    moveAllPropsDown(assembly: Assembly, entity: AssemblyEntity, stageNumber: StageNumber): boolean {
      const movedStage = entity.moveValueDown(stageNumber)
      if (movedStage) {
        updateWorldEntities(assembly, entity, movedStage)
        return true
      }
      return false
    },
    resetTrain(assembly: Assembly, entity: RollingStockAssemblyEntity): void {
      const stage = entity.firstStage
      const luaEntity = entity.getWorldEntity(stage)
      if (!luaEntity) {
        refreshWorldEntityAtStage(assembly, entity, stage)
        return
      }

      const train = luaEntity.train
      if (!train) return

      const entities = train.carriages

      const content = assembly.content
      const assemblyEntities = entities.map((e) => content.findCompatible(e, nil)!)
      for (const entity of assemblyEntities) entity.destroyAllWorldOrPreviewEntities()
      for (const entity of assemblyEntities) replaceWorldEntityAtStage(assembly, entity, stage)
    },
    setTrainLocationToCurrent(assembly: Assembly, entity: RollingStockAssemblyEntity): void {
      const stage = entity.firstStage
      const luaEntity = entity.getWorldEntity(stage)
      if (!luaEntity) return

      const train = luaEntity.train
      if (!train) return

      const entities = train.carriages
      const content = assembly.content

      for (const luaEntity of entities) {
        const assemblyEntity = content.findCompatible(luaEntity, nil)
        if (assemblyEntity) {
          content.changePosition(assemblyEntity, luaEntity.position)
          replaceWorldEntityAtStage(assembly, assemblyEntity, stage)
        } else {
          // add
          AssemblyUpdater.addNewEntity(assembly, luaEntity, stage)
        }
      }
    },
  }
}

export const AssemblyUpdater = createAssemblyUpdater(WorldUpdater, EntityHandler, WireHandler)

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

import { L_Game, Prototypes } from "../constants"
import {
  AssemblyEntity,
  createAssemblyEntity,
  SavedDirection,
  StageNumber,
  UndergroundBeltAssemblyEntity,
} from "../entity/AssemblyEntity"
import { fixEmptyControlBehavior, hasControlBehaviorSet } from "../entity/empty-control-behavior"
import { BasicEntityInfo } from "../entity/Entity"
import { isCompatibleEntity, isRollingStockType, shouldCheckEntityExactlyForMatch } from "../entity/entity-info"
import { EntityHandler, EntitySaver } from "../entity/EntityHandler"
import { getSavedDirection } from "../entity/special-entities"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { AssemblyContent, StagePosition } from "./AssemblyContent"
import { findUndergroundPair } from "./special-entity-treatment"
import { WireHandler, WireSaver } from "./WireHandler"
import { AssemblyMoveEntityResult, WorldUpdater } from "./WorldUpdater"
import min = math.min

/**
 * Updates assembly in response to world changes.
 *
 * @noSelf
 */
export interface AssemblyUpdater {
  /** Handles when an entity is created. */
  onEntityCreated(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition, byPlayer: PlayerIndex | nil): void
  /** Handles when an entity is removed. */
  onEntityDeleted(
    assembly: AssemblyContent,
    entity: BasicEntityInfo,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void
  /**
   * Handles when an entity has its properties updated.
   * Does not handle wires.
   * If previousDirection is specified, also checks for rotation.
   *
   * Returns: `false` if a previous entity was not found (and may have been added).
   */
  onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection?: defines.direction,
  ): false | nil

  /** Handles when an entity is rotated by player. */
  onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection: defines.direction,
  ): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void

  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void

  /** When a cleanup tool has been used on an entity. */
  onCleanupToolUsed(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void
  /** Similar to above; does not remove settings remnants */
  tryFixEntity(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void

  onEntityForceDeleted(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityDied(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void
  /** User activated. */
  onMoveEntityToStage(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition, byPlayer: PlayerIndex): void
  moveEntityToStage(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    stageNumber: StageNumber,
    byPlayer: PlayerIndex,
  ): void

  onEntityMoved(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): void
}

/**
 * @noSelf
 */
export interface WorldNotifier {
  createNotification(
    entity: { position: Position; surface?: LuaSurface } | nil,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    errorSound: boolean,
  ): void
}

export function createAssemblyUpdater(
  worldUpdater: WorldUpdater,
  entitySaver: EntitySaver,
  wireSaver: WireSaver,
  notifier: WorldNotifier,
): AssemblyUpdater {
  const { deleteAllEntities, updateWorldEntities, clearWorldEntity } = worldUpdater
  const { saveEntity } = entitySaver
  const { saveWireConnections } = wireSaver
  const { createNotification } = notifier

  function onEntityCreated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const { stageNumber } = stage
    const { content } = assembly

    const entityName = entity.name
    const existing = shouldCheckEntityExactlyForMatch(entityName)
      ? content.findCompatible(entity, nil)
      : content.findCompatibleAnyDirection(entityName, entity.position) // if it doesn't overlap, find in any direction to avoid issues

    if (existing) {
      if (stageNumber >= existing.firstStage) {
        entityAddedAbove(assembly, existing, stageNumber, entity)
      } else {
        entityAddedBelow(assembly, existing, stageNumber, entity, byPlayer)
      }
      return existing
    }

    const [saved, savedDir] = saveEntity(entity)
    if (!saved) return
    // add new entity
    const assemblyEntity = createAssemblyEntity(saved, entity.position, savedDir, stageNumber)
    assemblyEntity.replaceWorldEntity(stageNumber, entity)
    content.add(assemblyEntity)

    if (entity.type === "underground-belt") {
      const [pair] = findUndergroundPair(assembly.content, assemblyEntity as UndergroundBeltAssemblyEntity)
      if (pair) {
        const otherDir = pair.firstValue.type
        ;(assemblyEntity as UndergroundBeltAssemblyEntity).setUndergroundBeltDirection(
          otherDir === "output" ? "input" : "output",
        )
      }
    }

    saveWireConnections(assembly, assemblyEntity, stageNumber)
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
    byPlayer: PlayerIndex | nil,
  ): void {
    if (existing.isSettingsRemnant) {
      existing.replaceWorldEntity(stageNumber, luaEntity)
      reviveSettingsRemnant(assembly, existing, stageNumber)
    } else {
      moveEntityDown(assembly, existing, stageNumber, luaEntity, byPlayer)
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
    byPlayer: PlayerIndex | nil,
  ): void {
    const oldStage = existing.moveToStage(stageNumber, true)
    createNotification(
      luaEntity,
      byPlayer,
      [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
      false,
    )
    existing.replaceWorldEntity(stageNumber, luaEntity)
    updateWorldEntities(assembly, existing, stageNumber, oldStage)
  }

  function onEntityDeleted(
    assembly: AssemblyContent,
    entity: BasicEntityInfo,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void {
    const { content } = assembly

    const existing = content.findCompatible(entity, nil)
    if (!existing) return
    const { stageNumber } = stage
    const existingStage = existing.firstStage

    if (existingStage !== stageNumber) {
      if (existingStage < stageNumber) {
        updateSingleWorldEntity(assembly, existing, stageNumber, true)
      }
      // else: stageNumber > existingStage; bug, ignore
      return
    }
    doEntityDelete(assembly, existing, entity, byPlayer)
  }

  function shouldMakeSettingsRemnant(assembly: AssemblyContent, entity: AssemblyEntity) {
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

  function doEntityDelete(
    assembly: AssemblyContent,
    assemblyEntity: AssemblyEntity,
    entity: BasicEntityInfo,
    byPlayer: PlayerIndex | nil,
  ): void {
    const oldStage = assemblyEntity.getOldStage()
    if (oldStage !== nil) {
      moveEntityToOldStage(assembly, assemblyEntity, oldStage, entity, byPlayer)
    } else if (shouldMakeSettingsRemnant(assembly, assemblyEntity)) {
      assemblyEntity.isSettingsRemnant = true
      worldUpdater.makeSettingsRemnant(assembly, assemblyEntity)
    } else {
      assembly.content.delete(assemblyEntity)
      deleteAllEntities(assemblyEntity)
    }
  }

  function moveEntityToOldStage(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    oldStage: StageNumber,
    luaEntity: BasicEntityInfo,
    byPlayer: PlayerIndex | nil,
  ): void {
    const currentStage = existing.firstStage
    existing.moveToStage(oldStage)
    createNotification(
      luaEntity,
      byPlayer,
      [L_Interaction.EntityMovedBackToStage, assembly.getStageName(oldStage)],
      false,
    )
    updateWorldEntities(assembly, existing, currentStage, oldStage)
  }

  function onEntityDied(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void {
    const existing = assembly.content.findCompatible(entity, nil)
    if (existing) {
      clearWorldEntity(assembly, existing, stage.stageNumber)
    }
  }

  /** Also asserts that stageNumber > entity's first stage. */
  function getCompatibleOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const compatible = assembly.content.findCompatible(entity, previousDirection)
    if (compatible && stage.stageNumber >= compatible.firstStage) {
      compatible.replaceWorldEntity(stage.stageNumber, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, stage, byPlayer)
      return nil
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
    newDirection: SavedDirection,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const rotateAllowed = stage.stageNumber === existing.firstStage
    if (rotateAllowed) {
      existing.setDirection(newDirection)
    } else {
      createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
      updateSingleWorldEntity(assembly, existing, stage.stageNumber, false)
    }
    return rotateAllowed
  }

  function updateEntityFromWorld(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    stageNumber: StageNumber,
  ): boolean {
    const entity = assert(existing.getWorldEntity(stageNumber))
    const [newValue, direction] = saveEntity(entity)
    assert(newValue, "could not save value on existing entity")
    assert(direction === existing.getDirection(), "direction mismatch on saved entity")
    const hasDiff = existing.adjustValueAtStage(stageNumber, newValue)
    return hasDiff
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection: defines.direction | nil,
  ): false | nil {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection, byPlayer)
    if (!existing) return false

    if (entity.type === "underground-belt") {
      onUndergroundBeltPotentiallyUpdated(assembly, entity, stage, existing as UndergroundBeltAssemblyEntity, byPlayer)
      return
    }

    const newDirection = entity.direction as SavedDirection
    const rotated = newDirection !== existing.getDirection()
    if (rotated) {
      if (!tryRotateOrUndo(assembly, entity, stage, existing, newDirection, byPlayer)) {
        // don't update other stuff if rotation failed
        return
      }
    }
    const { stageNumber } = stage
    existing.replaceWorldEntity(stageNumber, entity)
    const hasDiff = updateEntityFromWorld(assembly, existing, stageNumber)
    if (hasDiff || rotated) {
      updateWorldEntities(assembly, existing, stageNumber)
    }
  }

  function onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection: defines.direction,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection, byPlayer)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltRotated(assembly, entity, stage, existing as UndergroundBeltAssemblyEntity, byPlayer)
    }

    const newDirection = entity.direction as SavedDirection
    if (tryRotateOrUndo(assembly, entity, stage, existing, newDirection, byPlayer)) {
      // update all entities
      updateWorldEntities(assembly, existing, 1)
    }
  }

  function checkUpgradeType(existing: AssemblyEntity, upgradeType: string): void {
    if (!isCompatibleEntity(existing.firstValue.name, upgradeType))
      error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
  }

  function onEntityMarkedForUpgrade(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, nil, byPlayer)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltMarkedForUpgrade(
        assembly,
        entity,
        stage,
        existing as UndergroundBeltAssemblyEntity,
        byPlayer,
      )
    }

    const rotateDir = entity.get_upgrade_direction() as SavedDirection
    const rotated = rotateDir !== nil && rotateDir !== existing.getDirection()
    if (rotated) {
      if (!tryRotateOrUndo(assembly, entity, stage, existing, rotateDir, byPlayer)) {
        // don't update other stuff if rotation failed
        if (entity.valid) entity.cancel_upgrade(entity.force)
        return
      }
    }

    const { stageNumber } = stage

    let upgraded = false
    const upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      checkUpgradeType(existing, upgradeType)
      upgraded = existing.applyUpgradeAtStage(stageNumber, upgradeType)
    }
    if (rotated || upgraded) {
      updateWorldEntities(assembly, existing, stageNumber)
    }
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  function onUndergroundBeltRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: UndergroundBeltAssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const actualDirection = getSavedDirection(entity)
    assert(actualDirection === existing.getDirection(), "underground belt direction mismatch with saved state")
    const oldDir = existing.firstValue.type
    const newDir = entity.belt_to_ground_type
    if (oldDir === newDir) return

    const { stageNumber } = stage
    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)

    function checkRotateAllowed() {
      if (hasMultiple) {
        createNotification(entity, byPlayer, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
        return false
      }
      const isFirstStage = existing.firstStage === stageNumber || (pair && pair.firstStage === stageNumber)
      if (!isFirstStage) {
        createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
        return false
      }
      return true
    }
    const rotateAllowed = checkRotateAllowed()

    if (!rotateAllowed) {
      updateSingleWorldEntity(assembly, existing, stageNumber, false)
      return
    }

    existing.setUndergroundBeltDirection(newDir)
    updateWorldEntities(assembly, existing, existing.firstStage)
    if (pair) {
      pair.setUndergroundBeltDirection(newDir === "output" ? "input" : "output")
      updateWorldEntities(assembly, pair, pair.firstStage)
    }
  }

  function tryUpgradeUnderground(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: UndergroundBeltAssemblyEntity,
    upgradeType: string,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const { stageNumber } = stage

    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)
    if (hasMultiple) {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
      return false
    }
    let isFirstStage = existing.firstStage === stageNumber
    if (pair) {
      isFirstStage ||= pair.firstStage === stageNumber
      if (!isFirstStage && existing.firstStage !== pair.firstStage) {
        createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
        return false
      }
    }
    const oldName = existing.firstValue.name
    const applyStage = isFirstStage ? existing.firstStage : stageNumber
    const upgraded = existing.applyUpgradeAtStage(applyStage, upgradeType)
    if (!upgraded) return true

    if (pair) {
      const pairStage = isFirstStage ? pair.firstStage : stageNumber
      const pairUpgraded = pair.applyUpgradeAtStage(pairStage, upgradeType)
      // check pair still correct
      const [newPair, newMultiple] = findUndergroundPair(assembly.content, existing)
      if (newPair !== pair || newMultiple) {
        existing.applyUpgradeAtStage(applyStage, oldName)
        pair.applyUpgradeAtStage(pairStage, oldName)
        createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
        return false
      }

      updateWorldEntities(assembly, existing, applyStage)
      if (pairUpgraded) updateWorldEntities(assembly, pair, pairStage)
    } else {
      updateWorldEntities(assembly, existing, applyStage)
    }
    return true
  }

  function onUndergroundBeltMarkedForUpgrade(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: UndergroundBeltAssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      checkUpgradeType(existing, upgradeType)
      tryUpgradeUnderground(assembly, entity, stage, existing, upgradeType, byPlayer)
    }
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  function onUndergroundBeltPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: UndergroundBeltAssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const newType = entity.name
    if (newType !== existing.getNameAtStage(stage.stageNumber)) {
      const upgraded = tryUpgradeUnderground(assembly, entity, stage, existing, newType, byPlayer)
      if (!upgraded) {
        updateSingleWorldEntity(assembly, existing, stage.stageNumber, false)
      }
    }
  }

  function onCircuitWiresPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, nil, byPlayer)
    if (!existing) return
    const { stageNumber } = stage
    const [connectionsChanged, maxConnectionsExceeded] = saveWireConnections(assembly, existing, stageNumber)
    if (maxConnectionsExceeded) {
      createNotification(entity, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
    }
    if (!connectionsChanged) return

    const circuitConnections = assembly.content.getCircuitConnections(existing)
    if (circuitConnections) {
      checkDefaultControlBehavior(assembly, existing, stageNumber)
      for (const [otherEntity] of circuitConnections) {
        checkDefaultControlBehavior(assembly, otherEntity, stageNumber)
      }
    }
    updateWorldEntities(assembly, existing, existing.firstStage)
  }
  function checkDefaultControlBehavior(
    assembly: AssemblyContent,
    entity: AssemblyEntity,
    stageNumber: StageNumber,
  ): void {
    if (!hasControlBehaviorSet(entity, stageNumber)) {
      fixEmptyControlBehavior(entity)
      updateEntityFromWorld(assembly, entity, stageNumber)
    }
  }

  function getEntityIfIsSelectablePreview(
    entity: LuaEntity,
    stage: StagePosition,
    assembly: AssemblyContent,
  ): AssemblyEntity | nil {
    const entityName = entity.name
    if (!entityName.startsWith(Prototypes.PreviewEntityPrefix)) return nil
    const actualName = entityName.substring(Prototypes.PreviewEntityPrefix.length)

    let result: AssemblyEntity | nil
    if (isRollingStockType(actualName)) {
      result = assembly.content.findCompatibleAnyDirection(actualName, entity.position)
    } else {
      result = assembly.content.findCompatibleByName(actualName, entity.position, entity.direction)
    }
    if (!result) return nil
    if (stage.stageNumber >= result.firstStage || result.isSettingsRemnant) return result
  }

  function onCleanupToolUsed(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void {
    tryFixEntity(assembly, proxyEntity, stage, true)
  }

  function tryFixEntity(
    assembly: AssemblyContent,
    proxyEntity: LuaEntity,
    stage: StagePosition,
    deleteSettingsRemnants: boolean,
  ) {
    const existing = getEntityIfIsSelectablePreview(proxyEntity, stage, assembly)
    if (!existing) return
    if (!existing.isSettingsRemnant) {
      // this is an error entity, trrd revive
      if (stage.stageNumber < existing.firstStage) return
      updateWorldEntities(assembly, existing, stage.stageNumber, nil)
    } else if (deleteSettingsRemnants) {
      // settings remnant, remove
      assembly.content.delete(existing)
      deleteAllEntities(existing)
    }
  }

  function onEntityForceDeleted(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void {
    const existing = getEntityIfIsSelectablePreview(proxyEntity, stage, assembly)
    if (!existing) return
    assembly.content.delete(existing)
    deleteAllEntities(existing)
  }

  function getEntityFromPreviewEntity(
    entityOrPreviewEntity: LuaEntity,
    stage: StagePosition,
    assembly: AssemblyContent,
  ): AssemblyEntity | nil {
    const name = entityOrPreviewEntity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return assembly.content.findCompatibleByName(
        name.substring(Prototypes.PreviewEntityPrefix.length),
        entityOrPreviewEntity.position,
        entityOrPreviewEntity.direction,
      )
    }
    return assembly.content.findCompatible(entityOrPreviewEntity, nil)
  }

  function onMoveEntityToStage(
    assembly: AssemblyContent,
    entityOrPreviewEntity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex,
  ): void {
    const existing = getEntityFromPreviewEntity(entityOrPreviewEntity, stage, assembly)
    if (!existing) return
    const { stageNumber } = stage
    moveEntityToStage(assembly, existing, stageNumber, byPlayer)
  }
  function moveEntityToStage(
    assembly: AssemblyContent,
    existing: AssemblyEntity,
    stageNumber: StageNumber,
    byPlayer: PlayerIndex,
  ) {
    if (existing.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existing, stageNumber)
      return
    }
    const oldStage = existing.firstStage

    if (oldStage === stageNumber) {
      createNotification(existing, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
      return
    }

    if (existing.isUndergroundBelt()) {
      if (existing.getNameAtStage(stageNumber) !== existing.firstValue.name) {
        createNotification(existing, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
        return
      }
    }

    // move
    existing.moveToStage(stageNumber, false)
    updateWorldEntities(assembly, existing, min(oldStage, stageNumber))
    createNotification(existing, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
  }

  function getCompatibleAtPositionOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const existing = assembly.content.findExactAtPosition(entity, stage.stageNumber, oldPosition)
    if (existing) return existing
    onEntityCreated(assembly, entity, stage, byPlayer)
    return nil
  }

  function onEntityMoved(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleAtPositionOrAdd(assembly, entity, stage, oldPosition, byPlayer)
    if (!existing) return
    assert(!existing.isSettingsRemnant && !existing.isUndergroundBelt(), "cannot move this entity")
    const result = worldUpdater.tryMoveOtherEntities(assembly, existing, stage.stageNumber)
    const message = moveResultMessage[result]
    if (message === nil) return
    createNotification(entity, byPlayer, [message, ["entity-name." + entity.name]], true)
  }

  const moveResultMessage: Record<AssemblyMoveEntityResult, L_Interaction | nil> = {
    success: nil,
    "connected-entities-missing": L_Interaction.ConnectedEntitiesMissing,
    "entities-missing": L_Interaction.EntitiesMissing,
    overlap: L_Interaction.NoRoomInAnotherStage,
    "could-not-teleport": L_Interaction.CantBeTeleportedInAnotherStage,
    "not-first-stage": L_Interaction.CannotMove,
    "wires-cannot-reach": L_Interaction.WiresMaxedInAnotherStage,
  }

  return {
    onEntityCreated,
    onEntityDeleted,
    onEntityPotentiallyUpdated,
    onEntityRotated,
    onCircuitWiresPotentiallyUpdated,
    onEntityMarkedForUpgrade,
    onCleanupToolUsed,
    tryFixEntity(assembly: AssemblyContent, proxyEntity: LuaEntity, stage: StagePosition): void {
      tryFixEntity(assembly, proxyEntity, stage, false)
    },
    onEntityForceDeleted,
    onEntityDied,
    onMoveEntityToStage,
    moveEntityToStage,
    onEntityMoved,
  }
}

const WorldNotifier: WorldNotifier = {
  createNotification(
    at:
      | {
          position: Position
          surface?: LuaSurface
        }
      | nil,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    playSound: boolean,
  ): void {
    const player = playerIndex ? game.get_player(playerIndex) : nil
    if (player) {
      if (at) {
        player.create_local_flying_text({
          text: message,
          position: at.position,
        })
      } else {
        player.create_local_flying_text({
          text: message,
          create_at_cursor: true,
        })
      }
      if (playSound) player.play_sound({ path: "utility/cannot_build" })
    } else if (at && at.surface && at.surface.valid) {
      at.surface.create_entity({
        name: "flying-text",
        position: at.position,
        text: message,
      })
    }
  },
}

export const AssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(
  WorldUpdater,
  EntityHandler,
  WireHandler,
  WorldNotifier,
)

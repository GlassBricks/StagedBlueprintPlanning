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
import { findUndergroundPair } from "../entity/special-entity-treatment"
import { WireHandler, WireSaver } from "../entity/WireHandler"
import { Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { AssemblyData } from "./AssemblyDef"
import { AssemblyMoveEntityResult, WorldUpdater } from "./WorldUpdater"
import min = math.min

/**
 * Updates assembly in response to world changes.
 *
 * @noSelf
 */
export interface AssemblyUpdater {
  /** Handles when an entity is created. */
  onEntityCreated(assembly: AssemblyData, stage: StageNumber, entity: LuaEntity, byPlayer: PlayerIndex | nil): void
  /** Handles when an entity is removed. */
  onEntityDeleted(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: BasicEntityInfo,
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
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): false | nil

  /** Handles when an entity is rotated by player. */
  onEntityRotated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void

  /** Handles possible circuit wires changes of an entity. */
  onCircuitWiresPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void

  /**
   * Handles upgrade planner.
   * Performs the requested upgrade, also handles rotation via upgrade.
   */
  onEntityMarkedForUpgrade(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void

  /** When a cleanup tool has been used on an entity. */
  onCleanupToolUsed(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void
  /** Similar to above; does not remove settings remnants */
  tryFixEntity(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void

  onEntityForceDeleted(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityDied(assembly: AssemblyData, stage: StageNumber, entity: BasicEntityInfo): void
  /** User activated. */
  onMoveEntityToStage(assembly: AssemblyData, stage: StageNumber, entity: LuaEntity, byPlayer: PlayerIndex): void
  moveEntityToStage(
    assembly: AssemblyData,
    stage: StageNumber,
    assemblyEntity: AssemblyEntity,
    byPlayer: PlayerIndex,
  ): void

  onEntityMoved(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
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
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const { content } = assembly

    const entityName = entity.name
    const existing = shouldCheckEntityExactlyForMatch(entityName)
      ? content.findCompatible(entity, nil)
      : content.findCompatibleAnyDirection(entityName, entity.position) // if it doesn't overlap, find in any direction to avoid issues

    if (existing) {
      if (stage >= existing.firstStage) {
        entityAddedAbove(assembly, existing, stage, entity)
      } else {
        entityAddedBelow(assembly, existing, stage, entity, byPlayer)
      }
      return existing
    }

    const [saved, savedDir] = saveEntity(entity)
    if (!saved) return
    // add new entity
    const assemblyEntity = createAssemblyEntity(saved, entity.position, savedDir, stage)
    assemblyEntity.replaceWorldEntity(stage, entity)
    content.add(assemblyEntity)

    if (entity.type === "underground-belt") {
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

  function updateSingleWorldEntity(
    assembly: AssemblyData,
    stage: StageNumber,
    assemblyEntity: AssemblyEntity,
    replace: boolean,
  ): void {
    updateWorldEntities(assembly, assemblyEntity, stage, stage, replace)
  }

  function entityAddedAbove(
    assembly: AssemblyData,
    existing: AssemblyEntity,
    stage: StageNumber,
    luaEntity: LuaEntity,
  ): void {
    if (existing.isSettingsRemnant) {
      existing.replaceWorldEntity(stage, luaEntity)
      reviveSettingsRemnant(assembly, existing, stage)
    } else {
      updateSingleWorldEntity(assembly, stage, existing, false)
    }
  }

  function entityAddedBelow(
    assembly: AssemblyData,
    existing: AssemblyEntity,
    stage: StageNumber,
    luaEntity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    if (existing.isSettingsRemnant) {
      existing.replaceWorldEntity(stage, luaEntity)
      reviveSettingsRemnant(assembly, existing, stage)
    } else {
      moveEntityDown(assembly, existing, stage, luaEntity, byPlayer)
    }
  }

  function reviveSettingsRemnant(assembly: AssemblyData, existing: AssemblyEntity, stage: StageNumber): void {
    existing.isSettingsRemnant = nil
    existing.moveToStage(stage)
    worldUpdater.reviveSettingsRemnant(assembly, existing)
  }

  function moveEntityDown(
    assembly: AssemblyData,
    existing: AssemblyEntity,
    stage: number,
    luaEntity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const oldStage = existing.moveToStage(stage, true)
    createNotification(
      luaEntity,
      byPlayer,
      [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
      false,
    )
    existing.replaceWorldEntity(stage, luaEntity)
    updateWorldEntities(assembly, existing, stage, oldStage)
  }

  function onEntityDeleted(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: BasicEntityInfo,
    byPlayer: PlayerIndex | nil,
  ): void {
    const { content } = assembly

    const existing = content.findCompatible(entity, nil)
    if (!existing) return
    const existingStage = existing.firstStage

    if (existingStage !== stage) {
      if (existingStage < stage) {
        updateSingleWorldEntity(assembly, stage, existing, true)
      }
      // else: stage > existingStage; bug, ignore
      return
    }
    doEntityDelete(assembly, existing, entity, byPlayer)
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

  function doEntityDelete(
    assembly: AssemblyData,
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
    assembly: AssemblyData,
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

  function onEntityDied(assembly: AssemblyData, stage: StageNumber, entity: BasicEntityInfo): void {
    const existing = assembly.content.findCompatible(entity, nil)
    if (existing) {
      clearWorldEntity(assembly, stage, existing)
    }
  }

  /** Also asserts that stage > entity's first stage. */
  function getCompatibleOrAdd(
    assembly: AssemblyData,
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const compatible = assembly.content.findCompatible(entity, previousDirection)
    if (compatible && stage >= compatible.firstStage) {
      compatible.replaceWorldEntity(stage, entity) // just in case
    } else {
      onEntityCreated(assembly, stage, entity, byPlayer)
      return nil
    }
    return compatible
  }

  /**
   * Undoes rotation if rotation failed.
   */
  function tryRotateOrUndo(
    assembly: AssemblyData,
    entity: LuaEntity,
    stage: StageNumber,
    existing: AssemblyEntity,
    newDirection: SavedDirection,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const rotateAllowed = stage === existing.firstStage
    if (rotateAllowed) {
      existing.setDirection(newDirection)
    } else {
      createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
      updateSingleWorldEntity(assembly, stage, existing, false)
    }
    return rotateAllowed
  }

  function updateEntityFromWorld(assembly: AssemblyData, existing: AssemblyEntity, stage: StageNumber): boolean {
    const entity = assert(existing.getWorldEntity(stage))
    const [newValue, direction] = saveEntity(entity)
    assert(newValue, "could not save value on existing entity")
    assert(direction === existing.getDirection(), "direction mismatch on saved entity")
    const hasDiff = existing.adjustValueAtStage(stage, newValue)
    return hasDiff
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
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
    existing.replaceWorldEntity(stage, entity)
    const hasDiff = updateEntityFromWorld(assembly, existing, stage)
    if (hasDiff || rotated) {
      updateWorldEntities(assembly, existing, stage)
    }
  }

  function onEntityRotated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, previousDirection, byPlayer)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltRotated(assembly, stage, entity, existing as UndergroundBeltAssemblyEntity, byPlayer)
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
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
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

    let upgraded = false
    const upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      checkUpgradeType(existing, upgradeType)
      upgraded = existing.applyUpgradeAtStage(stage, upgradeType)
    }
    if (rotated || upgraded) {
      updateWorldEntities(assembly, existing, stage)
    }
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  function onUndergroundBeltRotated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    existing: UndergroundBeltAssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const actualDirection = getSavedDirection(entity)
    assert(actualDirection === existing.getDirection(), "underground belt direction mismatch with saved state")
    const oldDir = existing.firstValue.type
    const newDir = entity.belt_to_ground_type
    if (oldDir === newDir) return

    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)

    function checkRotateAllowed() {
      if (hasMultiple) {
        createNotification(entity, byPlayer, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
        return false
      }
      const isFirstStage = existing.firstStage === stage || (pair && pair.firstStage === stage)
      if (!isFirstStage) {
        createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
        return false
      }
      return true
    }
    const rotateAllowed = checkRotateAllowed()

    if (!rotateAllowed) {
      updateSingleWorldEntity(assembly, stage, existing, false)
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
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    existing: UndergroundBeltAssemblyEntity,
    upgradeType: string,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)
    if (hasMultiple) {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
      return false
    }
    let isFirstStage = existing.firstStage === stage
    if (pair) {
      isFirstStage ||= pair.firstStage === stage
      if (!isFirstStage && existing.firstStage !== pair.firstStage) {
        createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
        return false
      }
    }
    const oldName = existing.firstValue.name
    const applyStage = isFirstStage ? existing.firstStage : stage
    const upgraded = existing.applyUpgradeAtStage(applyStage, upgradeType)
    if (!upgraded) return true

    if (pair) {
      const pairStage = isFirstStage ? pair.firstStage : stage
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
    assembly: AssemblyData,
    entity: LuaEntity,
    stage: StageNumber,
    existing: UndergroundBeltAssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const upgradeType = entity.get_upgrade_target()?.name
    if (upgradeType) {
      checkUpgradeType(existing, upgradeType)
      tryUpgradeUnderground(assembly, stage, entity, existing, upgradeType, byPlayer)
    }
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  function onUndergroundBeltPotentiallyUpdated(
    assembly: AssemblyData,
    entity: LuaEntity,
    stage: StageNumber,
    existing: UndergroundBeltAssemblyEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const newType = entity.name
    if (newType !== existing.getNameAtStage(stage)) {
      const upgraded = tryUpgradeUnderground(assembly, stage, entity, existing, newType, byPlayer)
      if (!upgraded) {
        updateSingleWorldEntity(assembly, stage, existing, false)
      }
    }
  }

  function onCircuitWiresPotentiallyUpdated(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, nil, byPlayer)
    if (!existing) return
    const [connectionsChanged, maxConnectionsExceeded] = saveWireConnections(assembly.content, existing, stage)
    if (maxConnectionsExceeded) {
      createNotification(entity, byPlayer, [L_Interaction.MaxConnectionsReachedInAnotherStage], true)
    }
    if (!connectionsChanged) return

    const circuitConnections = assembly.content.getCircuitConnections(existing)
    if (circuitConnections) {
      checkDefaultControlBehavior(assembly, existing, stage)
      for (const [otherEntity] of circuitConnections) {
        checkDefaultControlBehavior(assembly, otherEntity, stage)
      }
    }
    updateWorldEntities(assembly, existing, existing.firstStage)
  }
  function checkDefaultControlBehavior(assembly: AssemblyData, entity: AssemblyEntity, stage: StageNumber): void {
    if (!hasControlBehaviorSet(entity, stage)) {
      fixEmptyControlBehavior(entity)
      updateEntityFromWorld(assembly, entity, stage)
    }
  }

  function getEntityIfIsSelectablePreview(
    entity: LuaEntity,
    stage: StageNumber,
    assembly: AssemblyData,
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
    if (stage >= result.firstStage || result.isSettingsRemnant) return result
  }

  function onCleanupToolUsed(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void {
    tryFixEntity(assembly, stage, proxyEntity, true)
  }

  function tryFixEntity(
    assembly: AssemblyData,
    stage: StageNumber,
    proxyEntity: LuaEntity,
    deleteSettingsRemnants: boolean,
  ) {
    const existing = getEntityIfIsSelectablePreview(proxyEntity, stage, assembly)
    if (!existing) return
    if (!existing.isSettingsRemnant) {
      // this is an error entity, try revive
      if (stage < existing.firstStage) return
      updateWorldEntities(assembly, existing, stage, nil)
    } else if (deleteSettingsRemnants) {
      // settings remnant, remove
      assembly.content.delete(existing)
      deleteAllEntities(existing)
    }
  }

  function onEntityForceDeleted(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void {
    const existing = getEntityIfIsSelectablePreview(proxyEntity, stage, assembly)
    if (!existing) return
    assembly.content.delete(existing)
    deleteAllEntities(existing)
  }

  function getEntityFromPreviewEntity(
    entityOrPreviewEntity: LuaEntity,
    stage: StageNumber,
    assembly: AssemblyData,
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
    assembly: AssemblyData,
    stage: StageNumber,
    entityOrPreviewEntity: LuaEntity,
    byPlayer: PlayerIndex,
  ): void {
    const existing = getEntityFromPreviewEntity(entityOrPreviewEntity, stage, assembly)
    if (!existing) return
    moveEntityToStage(assembly, stage, existing, byPlayer)
  }
  function moveEntityToStage(
    assembly: AssemblyData,
    stage: StageNumber,
    existing: AssemblyEntity,
    byPlayer: PlayerIndex,
  ) {
    if (existing.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existing, stage)
      return
    }
    const oldStage = existing.firstStage

    if (oldStage === stage) {
      createNotification(existing, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
      return
    }

    if (existing.isUndergroundBelt()) {
      if (existing.getNameAtStage(stage) !== existing.firstValue.name) {
        createNotification(existing, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
        return
      }
    }

    // move
    existing.moveToStage(stage, false)
    updateWorldEntities(assembly, existing, min(oldStage, stage))
    createNotification(existing, byPlayer, [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)], false)
  }

  function getCompatibleAtPositionOrAdd(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const existing = assembly.content.findExactAtPosition(entity, stage, oldPosition)
    if (existing) return existing
    onEntityCreated(assembly, stage, entity, byPlayer)
    return nil
  }

  function onEntityMoved(
    assembly: AssemblyData,
    stage: StageNumber,
    entity: LuaEntity,
    oldPosition: Position,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleAtPositionOrAdd(assembly, stage, entity, oldPosition, byPlayer)
    if (!existing) return
    assert(!existing.isSettingsRemnant && !existing.isUndergroundBelt(), "cannot move this entity")
    const result = worldUpdater.tryMoveOtherEntities(assembly, stage, existing)
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
    tryFixEntity(assembly: AssemblyData, stage: StageNumber, proxyEntity: LuaEntity): void {
      tryFixEntity(assembly, stage, proxyEntity, false)
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

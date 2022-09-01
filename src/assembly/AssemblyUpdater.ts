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
import { AssemblyEntity, createAssemblyEntity, StageNumber } from "../entity/AssemblyEntity"
import { BasicEntityInfo } from "../entity/Entity"
import { getEntityCategory, isUndergroundBeltType, overlapsWithSelf } from "../entity/entity-info"
import { DefaultEntityHandler, EntitySaver } from "../entity/EntityHandler"
import { getSavedDirection } from "../entity/undergrounds"
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
   */
  onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection?: defines.direction,
  ): void

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
  /** Either: entity died, or reverse select with cleanup tool */
  onEntityForceDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void
  /** User activated. */
  onMoveEntityToStage(assembly: AssemblyContent, entity: LuaEntity, stage: StagePosition, byPlayer: PlayerIndex): void
}

/**
 * @noSelf
 */
export interface WorldNotifier {
  createNotification(
    entity: BasicEntityInfo,
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
  const { deleteAllEntities, updateWorldEntities, forceDeleteEntity } = worldUpdater
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

  function onEntityCreated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): AssemblyEntity | nil {
    const position = entity.position
    const { stageNumber } = stage
    const { content } = assembly

    const entityName = entity.name
    const existing = overlapsWithSelf(entityName)
      ? content.findCompatible(entity, position, nil)
      : content.findCompatibleAnyDirection(entityName, position) // if doesn't overlap, find in any direction to avoid issues

    if (existing) {
      const existingStage = existing.getFirstStage()
      if (existingStage <= stageNumber) {
        entityAddedAbove(assembly, existing, stageNumber, entity)
        return existing
      }
    }

    if (existing) {
      // stageNumber < existing.stageNumber
      entityAddedBelow(assembly, existing, stageNumber, entity, byPlayer)
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
    const position = entity.position
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
    doEntityDelete(assembly, existing, entity, byPlayer)
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
    } else if (assemblyEntity.hasStageDiff()) {
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
    const currentStage = existing.getFirstStage()
    existing.moveToStage(oldStage)
    createNotification(
      luaEntity,
      byPlayer,
      [L_Interaction.EntityMovedBackToStage, assembly.getStageName(oldStage)],
      false,
    )
    updateWorldEntities(assembly, existing, currentStage, oldStage)
  }

  function onEntityForceDeleted(assembly: AssemblyContent, entity: BasicEntityInfo, stage: StagePosition): void {
    const existing = assembly.content.findCompatible(entity, entity.position, nil)
    if (existing) {
      forceDeleteEntity(assembly, existing, stage.stageNumber)
    }
  }

  /** Also asserts that stageNumber > entity's first stage. */
  function getCompatibleOrAdd(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection: defines.direction | nil,
  ): AssemblyEntity | nil {
    const position = entity.position
    const compatible = assembly.content.findCompatible(entity, position, previousDirection)
    if (compatible && stage.stageNumber >= compatible.getFirstStage()) {
      compatible.replaceWorldEntity(stage.stageNumber, entity) // just in case
    } else {
      onEntityCreated(assembly, entity, stage, byPlayer)
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
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const rotateAllowed = stage.stageNumber === existing.getFirstStage()
    if (rotateAllowed) {
      existing.setDirection(newDirection)
    } else {
      createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
      updateSingleWorldEntity(assembly, existing, stage.stageNumber, false)
    }
    return rotateAllowed
  }

  function onEntityPotentiallyUpdated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection: defines.direction | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, byPlayer, previousDirection)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltPotentiallyUpdated(
        assembly,
        entity,
        stage,
        existing as AssemblyUndergroundEntity,
        byPlayer,
      )
    }

    const newDirection = entity.direction
    const rotated = newDirection !== existing.getDirection()
    if (rotated) {
      if (!tryRotateOrUndo(assembly, entity, stage, existing, newDirection, byPlayer)) {
        // don't update other stuff if rotation failed
        return
      }
    }

    const [newValue, direction] = saveEntity(entity)
    assert(newValue, "could not save value on existing entity")
    assert(direction === existing.getDirection(), "direction mismatch on saved entity")
    const hasDiff = existing.adjustValueAtStage(stage.stageNumber, newValue)
    if (hasDiff || rotated) {
      updateWorldEntities(assembly, existing, stage.stageNumber)
    }
  }

  function onEntityRotated(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
    previousDirection: defines.direction,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, byPlayer, previousDirection)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltRotated(assembly, entity, stage, existing as AssemblyUndergroundEntity, byPlayer)
    }

    const newDirection = entity.direction
    if (tryRotateOrUndo(assembly, entity, stage, existing, newDirection, byPlayer)) {
      // update all entities
      updateWorldEntities(assembly, existing, 1)
    }
  }

  function checkUpgradeType(existing: AssemblyEntity, upgradeType: string): void {
    if (getEntityCategory(upgradeType) !== existing.categoryName) {
      error(
        ` incompatible upgrade type to ${upgradeType}: category ${getEntityCategory(upgradeType)}, existing category: ${
          existing.categoryName
        }`,
      )
    }
  }

  function onEntityMarkedForUpgrade(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getCompatibleOrAdd(assembly, entity, stage, byPlayer, nil)
    if (!existing) return

    if (entity.type === "underground-belt") {
      return onUndergroundBeltMarkedForUpgrade(assembly, entity, stage, existing as AssemblyUndergroundEntity, byPlayer)
    }

    const rotateDir = entity.get_upgrade_direction()
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
    existing: AssemblyUndergroundEntity,
    byPlayer: PlayerIndex | nil,
  ): void {
    const actualDirection = getSavedDirection(entity)
    assert(actualDirection === existing.getDirection(), "underground belt direction mismatch with saved state")
    const oldDir = existing.getFirstValue().type
    const newDir = entity.belt_to_ground_type
    if (oldDir === newDir) return

    const { stageNumber } = stage
    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)

    function checkRotateAllowed() {
      if (hasMultiple) {
        createNotification(entity, byPlayer, [L_Interaction.CannotFlipUndergroundDueToMultiplePairs], true)
        return false
      }
      const isFirstStage = existing.getFirstStage() === stageNumber || (pair && pair.getFirstStage() === stageNumber)
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
    updateWorldEntities(assembly, existing, existing.getFirstStage())
    if (pair) {
      pair.setUndergroundBeltDirection(newDir === "output" ? "input" : "output")
      updateWorldEntities(assembly, pair, pair.getFirstStage())
    }
  }

  function tryUpgradeUnderground(
    assembly: AssemblyContent,
    entity: LuaEntity,
    stage: StagePosition,
    existing: AssemblyUndergroundEntity,
    upgradeType: string,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const { stageNumber } = stage

    const [pair, hasMultiple] = findUndergroundPair(assembly.content, existing)
    if (hasMultiple) {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundDueToMultiplePairs], true)
      return false
    }
    let isFirstStage = existing.getFirstStage() === stageNumber
    if (pair) {
      isFirstStage ||= pair.getFirstStage() === stageNumber
      if (!isFirstStage && existing.getFirstStage() !== pair.getFirstStage()) {
        createNotification(entity, byPlayer, [L_Interaction.CannotCreateUndergroundUpgradeIfNotInSameStage], true)
        return false
      }
    }
    const oldName = existing.getFirstValue().name
    const applyStage = isFirstStage ? existing.getFirstStage() : stageNumber
    const upgraded = existing.applyUpgradeAtStage(applyStage, upgradeType)
    if (!upgraded) return true

    if (pair) {
      const pairStage = isFirstStage ? pair.getFirstStage() : stageNumber
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
    existing: AssemblyUndergroundEntity,
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
    existing: AssemblyUndergroundEntity,
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
    const existing = getCompatibleOrAdd(assembly, entity, stage, byPlayer, nil)
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
    if (!proxyName.startsWith(Prototypes.SelectionProxyPrefix)) return nil
    const actualName = proxyName.substring(Prototypes.SelectionProxyPrefix.length)

    const position = proxyEntity.position
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
      deleteAllEntities(existing)
    }
  }

  function getEntityFromPreviewEntity(
    entityOrPreviewEntity: LuaEntity,
    stage: StagePosition,
    assembly: AssemblyContent,
  ): AssemblyEntity | nil {
    const position = entityOrPreviewEntity.position
    const name = entityOrPreviewEntity.name
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      return assembly.content.findCompatibleBasic(name.substring(Prototypes.PreviewEntityPrefix.length), position, nil)
    }
    return assembly.content.findCompatible(entityOrPreviewEntity, position, nil)
  }

  function isUndergroundEntity(entity: AssemblyEntity): entity is AssemblyUndergroundEntity {
    return isUndergroundBeltType(entity.getFirstValue().name)
  }

  function onMoveEntityToStage(
    assembly: AssemblyContent,
    entityOrPreviewEntity: LuaEntity,
    stage: StagePosition,
    byPlayer: PlayerIndex | nil,
  ): void {
    const existing = getEntityFromPreviewEntity(entityOrPreviewEntity, stage, assembly)
    if (!existing) return
    const { stageNumber } = stage
    if (existing.isSettingsRemnant) {
      reviveSettingsRemnant(assembly, existing, stageNumber)
      return
    }

    if (existing.getFirstStage() === stageNumber) {
      createNotification(entityOrPreviewEntity, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
      return
    }

    if (isUndergroundEntity(existing)) {
      if (existing.getNameAtStage(stageNumber) !== existing.getFirstValue().name) {
        createNotification(entityOrPreviewEntity, byPlayer, [L_Interaction.CannotMoveUndergroundBeltWithUpgrade], true)
        return
      }
    }

    // move
    const oldStage = existing.moveToStage(stageNumber, true)
    updateWorldEntities(assembly, existing, min(oldStage, stageNumber))
    createNotification(
      entityOrPreviewEntity,
      byPlayer,
      [L_Interaction.EntityMovedFromStage, assembly.getStageName(oldStage)],
      false,
    )
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
  createNotification(
    at: BasicEntityInfo,
    playerIndex: PlayerIndex | nil,
    message: LocalisedString,
    playSound: boolean,
  ): void {
    const player = playerIndex ? game.get_player(playerIndex) : nil
    if (player) {
      player.create_local_flying_text({
        text: message,
        create_at_cursor: true,
      })
      if (playSound) player.play_sound({ path: "utility/cannot_build" })
    } else if (at.surface.valid) {
      at.surface.create_entity({
        name: "flying-text",
        position: at.position,
        text: message,
      })
    }
  },
}

export const DefaultAssemblyUpdater: AssemblyUpdater = createAssemblyUpdater(
  DefaultWorldUpdater,
  DefaultEntityHandler,
  DefaultWireHandler,
  DefaultWorldNotifier,
)

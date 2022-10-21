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

import { AssemblyEntity, SavedDirection, StageNumber } from "../entity/AssemblyEntity"
import { isPreviewEntity } from "../entity/entity-info"
import { EntityMoveResult, forceMoveEntity, tryMoveAllEntities } from "../entity/entity-move"
import { EntityCreator, EntityHandler } from "../entity/EntityHandler"
import { EntityMap } from "../entity/EntityMap"
import { WireHandler, WireUpdater } from "../entity/WireHandler"
import { AssemblyData } from "./AssemblyDef"
import { EntityHighlighter } from "./EntityHighlighter"

/**
 * Updates entities in the world in response to changes in the assembly.
 *
 * This includes highlight entities.
 * @noSelf
 */
export interface WorldUpdater {
  /**
   * Updates/replaces stage entities for a given assembly entity.
   * @param assembly the assembly position info
   * @param entity the assembly entity
   * @param startStage
   * @param endStage inclusive. If not specified, defaults to the max assembly stage
   * @param replace if entities should be replaced (deleted and created) instead of updated
   */
  updateWorldEntities(
    assembly: AssemblyData,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage?: StageNumber,
    replace?: boolean,
  ): void

  /**
   * Tries to move an entity to a new position (after one world entity has already been moved).
   * @param assembly the assembly position info
   * @param stage the stage with the entity already moved into the new position
   * @param entity the assembly entity
   * @return the result of the move
   */
  tryMoveEntity(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): AssemblyEntityMoveResult

  /** Removes the world entity at a give stage (and makes error highlight) */
  clearWorldEntity(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void

  /** Removes ALL entities in ALL stages. */
  deleteAllEntities(entity: AssemblyEntity): void

  /** Removes non-main entities only (in preparation for assembly deletion) */
  deleteExtraEntitiesOnly(entity: AssemblyEntity): void

  makeSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity): void
}

export type AssemblyEntityMoveResult =
  | EntityMoveResult
  | "not-first-stage"
  | "entities-missing"
  | "connected-entities-missing"

export function createWorldUpdater(
  entityCreator: EntityCreator,
  wireHandler: WireUpdater,
  highlighter: EntityHighlighter,
): WorldUpdater {
  const { createEntity, createPreviewEntity, updateEntity } = entityCreator
  const { updateWireConnections } = wireHandler
  const { updateHighlights, deleteHighlights } = highlighter

  function doUpdateWorldEntities(
    assembly: AssemblyData,
    entity: AssemblyEntity,
    startStage: number,
    endStage: number,
    replace: boolean | nil,
  ): void {
    const firstStage = entity.firstStage
    const direction = entity.getDirection()

    for (const [stageNum, value] of entity.iterateValues(startStage, endStage)) {
      if (value === nil) {
        entity.destroyWorldOrPreviewEntity(stageNum)
        continue
      }

      const existing = entity.getWorldEntity(stageNum)
      let luaEntity: LuaEntity | nil
      if (existing && !replace) {
        luaEntity = updateEntity(existing, value, direction)
      } else {
        if (existing) existing.destroy()
        luaEntity = createEntity(assembly.getStage(stageNum)!.surface, entity.position, entity.getDirection(), value)
      }
      entity.replaceWorldEntity(stageNum, luaEntity)

      if (luaEntity) {
        if (stageNum !== firstStage) makeEntityIndestructible(luaEntity)
        else makeEntityDestructible(luaEntity)
        updateWireConnections(assembly.content, entity, stageNum)
      }
    }
  }

  function updatePreviewEntities(assembly: AssemblyData, entity: AssemblyEntity) {
    for (const [i, stage] of assembly.iterateStages(...entity.getPreviewStageRange())) {
      const worldEntity = entity.getWorldOrPreviewEntity(i)
      if (worldEntity) continue

      const previewEntity = createPreviewEntity(
        stage.surface,
        entity.position,
        entity.getApparentDirection(),
        entity.getNameAtStage(i),
      )
      entity.replaceWorldOrPreviewEntity(i, previewEntity)
    }
  }

  function updateWorldEntities(
    assembly: AssemblyData,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage?: StageNumber,
    replace?: boolean,
  ): void {
    if (entity.isSettingsRemnant) return makeSettingsRemnant(assembly, entity)

    if (startStage < 1) startStage = 1
    const maxStage = assembly.numStages()
    if (!endStage || endStage > maxStage) endStage = maxStage
    if (startStage > endStage) return

    doUpdateWorldEntities(assembly, entity, startStage, endStage, replace)
    updatePreviewEntities(assembly, entity)
    updateHighlights(assembly, entity, startStage, endStage)
  }

  function makeEntityIndestructible(entity: LuaEntity) {
    entity.minable = false
    entity.rotatable = false
    entity.destructible = false
  }
  function makeEntityDestructible(entity: LuaEntity) {
    entity.minable = true
    entity.rotatable = true
    entity.destructible = false
  }

  function tryMoveEntity(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): AssemblyEntityMoveResult {
    assert(!entity.isUndergroundBelt(), "can't move underground belts")
    const movedEntity = entity.getWorldEntity(stage)
    if (!movedEntity) return "entities-missing"
    const moveResult = tryMoveOtherEntities(assembly, entity, stage, movedEntity)
    if (moveResult !== "success") {
      forceMoveEntity(movedEntity, entity.position, entity.getDirection())
    } else {
      entity.setDirection(movedEntity.direction as SavedDirection)
      deleteHighlights(entity)
      updateHighlights(assembly, entity, entity.firstStage, assembly.numStages())
      const posChanged = assembly.content.changePosition(entity, movedEntity.position)
      assert(posChanged, "failed to change position in assembly content")
    }

    return moveResult
  }

  function tryMoveOtherEntities(
    assembly: AssemblyData,
    entity: AssemblyEntity,
    stage: StageNumber,
    movedEntity: LuaEntity,
  ): AssemblyEntityMoveResult {
    if (stage !== entity.firstStage) return "not-first-stage"

    // check all entities exist

    if (!checkConnectionWorldEntityExists(assembly.content, entity, stage, assembly.numStages()))
      return "connected-entities-missing"

    const entities: LuaEntity[] = []
    for (const stageNum of $range(1, entity.firstStage - 1)) {
      entities.push(entity.getWorldOrPreviewEntity(stageNum)!)
    }
    for (const stageNum of $range(entity.firstStage, assembly.numStages())) {
      const worldEntity = entity.getWorldOrPreviewEntity(stageNum)
      if (!worldEntity) return "entities-missing"
      entities.push(worldEntity)
    }

    return tryMoveAllEntities(entities, movedEntity.position, movedEntity.direction)
  }
  function checkConnectionWorldEntityExists(
    content: EntityMap,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage: StageNumber,
  ): boolean {
    const cableConnected = content.getCableConnections(entity)
    if (cableConnected) {
      for (const other of cableConnected) {
        if (!other.hasWorldEntityInRange(startStage, endStage)) return false
      }
    }
    const circuitConnections = content.getCircuitConnections(entity)
    if (circuitConnections) {
      for (const [other] of circuitConnections) {
        if (!other.hasWorldEntityInRange(startStage, endStage)) return false
      }
    }
    return true
  }

  function clearWorldEntity(assembly: AssemblyData, stage: StageNumber, entity: AssemblyEntity): void {
    entity.getWorldEntity(stage)?.destroy()
    updatePreviewEntities(assembly, entity)
    updateHighlights(assembly, entity, stage, stage)
  }
  function makeSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity): void {
    assert(entity.isSettingsRemnant)
    entity.destroyAllWorldOrPreviewEntities()
    updatePreviewEntities(assembly, entity)
    highlighter.makeSettingsRemnant(assembly, entity)
  }
  function reviveSettingsRemnant(assembly: AssemblyData, entity: AssemblyEntity): void {
    assert(!entity.isSettingsRemnant)
    doUpdateWorldEntities(assembly, entity, 1, assembly.numStages(), true)
    updatePreviewEntities(assembly, entity)
    highlighter.reviveSettingsRemnant(assembly, entity)
  }

  return {
    updateWorldEntities,
    tryMoveEntity: tryMoveEntity,
    clearWorldEntity,
    deleteAllEntities(entity: AssemblyEntity): void {
      entity.destroyAllWorldOrPreviewEntities()
      highlighter.deleteHighlights(entity)
    },
    deleteExtraEntitiesOnly(entity: AssemblyEntity): void {
      for (const [, luaEntity] of entity.iterateWorldOrPreviewEntities()) {
        if (isPreviewEntity(luaEntity)) luaEntity.destroy()
        else makeEntityDestructible(luaEntity)
      }
      highlighter.deleteHighlights(entity)
    },
    makeSettingsRemnant,
    reviveSettingsRemnant,
  }
}

export const WorldUpdater = createWorldUpdater(EntityHandler, WireHandler, EntityHighlighter)

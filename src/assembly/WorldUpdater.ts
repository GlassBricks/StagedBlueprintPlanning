/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Prototypes } from "../constants"
import { AssemblyContent } from "../entity/AssemblyContent"
import {
  AssemblyEntity,
  isWorldEntityAssemblyEntity,
  RollingStockAssemblyEntity,
  StageNumber,
} from "../entity/AssemblyEntity"
import { isPreviewEntity } from "../entity/entity-info"
import { createEntity, createPreviewEntity, updateEntity } from "../entity/EntityHandler"
import { EntityDollyResult, forceDollyEntity, tryDollyAllEntities } from "../entity/picker-dollies"
import { WireHandler, WireUpdater } from "../entity/WireHandler"
import { Assembly } from "./AssemblyDef"
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
   */
  updateWorldEntities(assembly: Assembly, entity: AssemblyEntity, startStage: StageNumber, endStage?: StageNumber): void
  updateNewEntityWithoutWires(assembly: Assembly, entity: AssemblyEntity): void
  updateWireConnections(assembly: Assembly, entity: AssemblyEntity): void

  refreshWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void
  replaceWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void

  /**
   * Tries to move an entity to a new position (after one world entity has already been moved).
   * @param assembly the assembly position info
   * @param entity the assembly entity
   * @param stage the stage with the entity already moved into the new position
   * @return the result of the move
   */
  tryDollyEntities(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): AssemblyEntityDollyResult

  /** Removes the world entity at a give stage (and makes error highlight) */
  clearWorldEntity(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void

  /** Removes ALL entities in ALL stages. */
  deleteAllEntities(entity: AssemblyEntity): void

  makeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void
  reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void

  resetStage(assembly: Assembly, stage: StageNumber): void

  disableAllEntities(assembly: Assembly, stage: StageNumber): void
  enableAllEntities(assembly: Assembly, stage: StageNumber): void
}

export type AssemblyEntityDollyResult =
  | EntityDollyResult
  | "cannot-move"
  | "entities-missing"
  | "connected-entities-missing"

export function createWorldUpdater(wireHandler: WireUpdater, highlighter: EntityHighlighter): WorldUpdater {
  const { updateWireConnections } = wireHandler
  const { updateHighlights, deleteHighlights } = highlighter

  function makePreviewEntity(
    assembly: Assembly,
    stage: StageNumber,
    entity: AssemblyEntity,
    entityName: string,
    direction: defines.direction,
  ): void {
    const existing = entity.getWorldOrPreviewEntity(stage)
    const previewName = Prototypes.PreviewEntityPrefix + entityName
    if (existing && isPreviewEntity(existing) && existing.name == previewName) {
      existing.direction = direction
    } else {
      const previewEntity = createPreviewEntity(assembly.getSurface(stage)!, entity.position, direction, entityName)
      entity.replaceWorldOrPreviewEntity(stage, previewEntity)
    }
  }

  function updateWorldEntitiesOnlyUnchecked(
    assembly: Assembly,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage: StageNumber,
  ): void {
    const firstStage = entity.firstStage
    const direction = entity.getDirection()
    const previewDirection = entity.getPreviewDirection()

    for (const [stage, value] of entity.iterateValues(startStage, endStage)) {
      const surface = assembly.getSurface(stage)!
      const existing = entity.getWorldOrPreviewEntity(stage)

      if (value != nil) {
        let luaEntity: LuaEntity | nil
        if (existing && !isPreviewEntity(existing)) {
          luaEntity = updateEntity(existing, value, direction)
        } else {
          luaEntity = createEntity(surface, entity.position, direction, value)
        }

        if (luaEntity) {
          if (stage != firstStage) makeEntityIndestructible(luaEntity)
          else makeEntityDestructible(luaEntity)

          entity.replaceWorldOrPreviewEntity(stage, luaEntity)

          continue
        }
        // else, fall through to make preview
      }

      // preview
      const entityName = (value ?? entity.firstValue).name
      makePreviewEntity(assembly, stage, entity, entityName, previewDirection)
    }
  }

  function updateWires(
    assembly: Assembly,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage: StageNumber,
  ): void {
    const content = assembly.content
    for (const stage of $range(startStage, endStage)) {
      const worldEntity = entity.getWorldEntity(stage)
      if (worldEntity) {
        updateWireConnections(content, entity, stage)
      }
    }
  }

  function updateEntitiesAndWires(
    assembly: Assembly,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage: StageNumber | nil,
  ): LuaMultiReturn<[_?: nil] | [StageNumber, StageNumber]> {
    const [start, end] = getActualStageRange(assembly, entity, startStage, endStage)
    if (!start) return $multi()

    updateWorldEntitiesOnlyUnchecked(assembly, entity, start, end)
    updateWires(assembly, entity, start, end)
    return $multi(start, end)
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
  function tryMoveOtherEntities(
    assembly: Assembly,
    entity: AssemblyEntity,
    stage: StageNumber,
    movedEntity: LuaEntity,
  ): AssemblyEntityDollyResult {
    if (entity.isUndergroundBelt() || entity.firstStage != stage) return "cannot-move"

    if (!checkConnectionWorldEntityExists(assembly.content, entity, stage, assembly.maxStage()))
      return "connected-entities-missing"

    const entities: LuaEntity[] = []
    for (const stageNum of $range(1, entity.firstStage - 1)) {
      entities.push(entity.getWorldOrPreviewEntity(stageNum)!)
    }
    for (const stageNum of $range(entity.firstStage, assembly.maxStage())) {
      const worldEntity = entity.getWorldOrPreviewEntity(stageNum)
      if (!worldEntity) return "entities-missing"
      entities.push(worldEntity)
    }

    return tryDollyAllEntities(entities, movedEntity.position, movedEntity.direction)
  }
  function checkConnectionWorldEntityExists(
    content: AssemblyContent,
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

  function makeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
    assert(entity.isSettingsRemnant && !entity.inFirstStageOnly())
    entity.destroyAllWorldOrPreviewEntities()
    const direction = entity.getPreviewDirection()
    for (const stage of $range(1, assembly.maxStage())) {
      makePreviewEntity(assembly, stage, entity, entity.getNameAtStage(stage), direction)
    }
    highlighter.makeSettingsRemnant(assembly, entity)
  }
  function reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
    assert(!entity.isSettingsRemnant)
    const [updated] = updateEntitiesAndWires(assembly, entity, 1, nil)
    if (!updated) return
    highlighter.reviveSettingsRemnant(assembly, entity)
  }

  function refreshWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
    const [updated] = updateEntitiesAndWires(assembly, entity, stage, stage)
    if (updated) updateHighlights(assembly, entity, stage, stage)
  }
  function getActualStageRange(
    assembly: Assembly,
    entity: AssemblyEntity,
    startStage: StageNumber,
    endStage: StageNumber | nil,
  ): LuaMultiReturn<[StageNumber, StageNumber] | [_?: nil]> {
    if (startStage < 1) startStage = 1
    const maxStage = assembly.maxStage()
    if (!endStage || endStage > maxStage) endStage = maxStage
    if (startStage > endStage) return $multi()

    if (startStage == entity.firstStage) {
      startStage = 1 // also update previews
    }
    return $multi(startStage, endStage)
  }
  return {
    updateWorldEntities(
      assembly: Assembly,
      entity: AssemblyEntity,
      startStage: StageNumber,
      endStage: StageNumber | nil,
    ): void {
      if (entity.isSettingsRemnant) return makeSettingsRemnant(assembly, entity)
      const [actualStart, actualEnd] = updateEntitiesAndWires(assembly, entity, startStage, endStage)
      if (actualStart) updateHighlights(assembly, entity, actualStart, actualEnd)
    },
    updateNewEntityWithoutWires(assembly: Assembly, entity: AssemblyEntity): void {
      if (entity.isSettingsRemnant) return makeSettingsRemnant(assembly, entity)
      const [actualStart, actualEnd] = getActualStageRange(assembly, entity, 1, nil)
      if (!actualStart) return
      updateWorldEntitiesOnlyUnchecked(assembly, entity, actualStart, actualEnd)
      updateHighlights(assembly, entity, actualStart, actualEnd)
    },
    updateWireConnections(assembly: Assembly, entity: AssemblyEntity): void {
      updateWires(assembly, entity, entity.firstStage, assembly.maxStage())
    },
    refreshWorldEntityAtStage,
    replaceWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
      entity.destroyWorldOrPreviewEntity(stage)
      refreshWorldEntityAtStage(assembly, entity, stage)
    },
    tryDollyEntities(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): AssemblyEntityDollyResult {
      const movedEntity = entity.getWorldOrPreviewEntity(stage)
      if (!movedEntity) return "entities-missing"
      const moveResult = tryMoveOtherEntities(assembly, entity, stage, movedEntity)
      if (moveResult != "success") {
        forceDollyEntity(movedEntity, entity.position, entity.getWorldDirection())
      } else {
        entity.setDirection(movedEntity.direction)
        deleteHighlights(entity)
        updateHighlights(assembly, entity, entity.firstStage, assembly.maxStage())
        const posChanged = assembly.content.changePosition(entity, movedEntity.position)
        assert(posChanged, "failed to change position in assembly content")
      }

      return moveResult
    },
    clearWorldEntity(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
      makePreviewEntity(assembly, stage, entity, entity.getNameAtStage(stage), entity.getPreviewDirection())
      updateHighlights(assembly, entity, stage, stage)
    },
    deleteAllEntities(entity: AssemblyEntity): void {
      entity.destroyAllWorldOrPreviewEntities()
      highlighter.deleteHighlights(entity)
    },
    makeSettingsRemnant,
    reviveSettingsRemnant,
    resetStage(assembly: Assembly, stage: StageNumber) {
      const surface = assembly.getSurface(stage)
      if (!surface) return
      for (const entity of surface.find_entities()) {
        if (isWorldEntityAssemblyEntity(entity)) entity.destroy()
      }
      for (const entity of surface.find_entities_filtered({
        type: ["simple-entity-with-owner", "rail-remnants"],
      })) {
        if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
      }
      const updateLater: RollingStockAssemblyEntity[] = []
      for (const entity of assembly.content.iterateAllEntities()) {
        if (entity.isRollingStock()) {
          updateLater.push(entity)
        } else {
          refreshWorldEntityAtStage(assembly, entity, stage)
        }
      }
      for (const entity of updateLater) {
        refreshWorldEntityAtStage(assembly, entity, stage)
      }
    },
    disableAllEntities(assembly: Assembly, stage: StageNumber): void {
      const surface = assembly.getSurface(stage)
      if (!surface) return
      const arr = surface.find_entities()
      for (const i of $range(1, arr.length)) {
        arr[i - 1].active = false
      }
    },
    enableAllEntities(assembly: Assembly, stage: StageNumber): void {
      const surface = assembly.getSurface(stage)
      if (!surface) return
      const arr = surface.find_entities()
      for (const i of $range(1, arr.length)) {
        arr[i - 1].active = true
      }
    },
  }
}

export const WorldUpdater = createWorldUpdater(WireHandler, EntityHighlighter)

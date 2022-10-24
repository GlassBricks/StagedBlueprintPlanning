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

import { Prototypes } from "../constants"
import { AssemblyEntity, isWorldEntityAssemblyEntity, SavedDirection, StageNumber } from "../entity/AssemblyEntity"
import { isPreviewEntity } from "../entity/entity-info"
import { EntityMoveResult, forceMoveEntity, tryMoveAllEntities } from "../entity/entity-move"
import { EntityCreator, EntityHandler } from "../entity/EntityHandler"
import { EntityMap } from "../entity/EntityMap"
import { WireHandler, WireUpdater } from "../entity/WireHandler"
import { Assembly, StageSurface } from "./AssemblyDef"
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

  clearStage(stage: StageSurface): void
}

export type AssemblyEntityDollyResult =
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

  function makePreviewEntity(
    assembly: Assembly,
    stage: StageNumber,
    entity: AssemblyEntity,
    entityName: string = entity.getNameAtStage(stage),
    direction: defines.direction = entity.getApparentDirection(),
  ): void {
    const existing = entity.getWorldOrPreviewEntity(stage)
    const previewName = Prototypes.PreviewEntityPrefix + entityName
    if (existing && isPreviewEntity(existing) && existing.name === previewName) {
      existing.direction = direction
    } else {
      const previewEntity = createPreviewEntity(
        assembly.getStage(stage)!.surface,
        entity.position,
        direction,
        entityName,
      )
      entity.replaceWorldOrPreviewEntity(stage, previewEntity)
    }
  }

  function doUpdateWorldEntities(
    assembly: Assembly,
    entity: AssemblyEntity,
    startStage: number,
    endStage: number,
  ): void {
    const firstStage = entity.firstStage
    const direction = entity.getApparentDirection()

    for (const [stage, value] of entity.iterateValues(startStage, endStage)) {
      const surface = assembly.getStage(stage)!.surface
      const existing = entity.getWorldOrPreviewEntity(stage)

      if (value !== nil) {
        let luaEntity: LuaEntity | nil
        if (existing && !isPreviewEntity(existing)) {
          luaEntity = updateEntity(existing, value, direction)
        } else {
          luaEntity = createEntity(surface, entity.position, direction, value)
        }

        if (luaEntity) {
          if (stage !== firstStage) makeEntityIndestructible(luaEntity)
          else makeEntityDestructible(luaEntity)

          entity.replaceWorldOrPreviewEntity(stage, luaEntity)

          updateWireConnections(assembly.content, entity, stage)
          continue
        }
        // else, fall through to make preview
      }

      // preview
      const entityName = (value ?? entity.firstValue).name
      makePreviewEntity(assembly, stage, entity, entityName, direction)
    }
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

  function makeSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
    assert(entity.isSettingsRemnant && !entity.inFirstStageOnly())
    entity.destroyAllWorldOrPreviewEntities()
    const direction = entity.getApparentDirection()
    for (const stage of $range(1, assembly.numStages())) {
      makePreviewEntity(assembly, stage, entity, entity.getNameAtStage(stage), direction)
    }
    highlighter.makeSettingsRemnant(assembly, entity)
  }
  function reviveSettingsRemnant(assembly: Assembly, entity: AssemblyEntity): void {
    assert(!entity.isSettingsRemnant)
    doUpdateWorldEntities(assembly, entity, 1, assembly.numStages())
    highlighter.reviveSettingsRemnant(assembly, entity)
  }

  function refreshWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
    doUpdateWorldEntities(assembly, entity, stage, stage)
    updateHighlights(assembly, entity, stage, stage)
  }
  return {
    updateWorldEntities(assembly: Assembly, entity: AssemblyEntity, startStage: StageNumber): void {
      if (entity.isSettingsRemnant) return makeSettingsRemnant(assembly, entity)

      const firstStage = entity.firstStage
      if (startStage < 1) startStage = 1
      let endStage = assembly.numStages()
      if (startStage > endStage) return

      if (entity.inFirstStageOnly()) {
        if (firstStage < startStage || firstStage > endStage) {
          return
        }
        startStage = firstStage
        endStage = firstStage
      } else if (startStage === entity.firstStage) {
        startStage = 1 // also update previews
      }

      doUpdateWorldEntities(assembly, entity, startStage, endStage)
      updateHighlights(assembly, entity, startStage, endStage)
    },
    refreshWorldEntityAtStage,
    replaceWorldEntityAtStage(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
      entity.destroyWorldOrPreviewEntity(stage)
      refreshWorldEntityAtStage(assembly, entity, stage)
    },
    tryDollyEntities(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): AssemblyEntityDollyResult {
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
    },
    clearWorldEntity(assembly: Assembly, entity: AssemblyEntity, stage: StageNumber): void {
      makePreviewEntity(assembly, stage, entity)
      updateHighlights(assembly, entity, stage, stage)
    },
    deleteAllEntities(entity: AssemblyEntity): void {
      entity.destroyAllWorldOrPreviewEntities()
      highlighter.deleteHighlights(entity)
    },
    makeSettingsRemnant,
    reviveSettingsRemnant,
    clearStage(stage: StageSurface) {
      for (const entity of stage.surface.find_entities()) {
        if (isWorldEntityAssemblyEntity(entity)) entity.destroy()
      }
      for (const entity of stage.surface.find_entities_filtered({
        type: ["simple-entity-with-owner", "rail-remnants"],
      })) {
        const name = entity.name
        if (name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
      }
    },
  }
}

export const WorldUpdater = createWorldUpdater(EntityHandler, WireHandler, EntityHighlighter)

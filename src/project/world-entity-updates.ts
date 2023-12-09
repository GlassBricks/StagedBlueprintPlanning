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

import { LocalisedString, LuaEntity } from "factorio:runtime"
import { Prototypes } from "../constants"
import { isPreviewEntity } from "../entity/entity-prototype-info"
import { EntityDollyResult, forceDollyEntity, tryDollyAllEntities } from "../entity/picker-dollies"
import { ProjectContent } from "../entity/ProjectContent"
import {
  isWorldEntityProjectEntity,
  ProjectEntity,
  RollingStockProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import { createEntity, createPreviewEntity, forceFlipUnderground, updateEntity } from "../entity/save-load"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { RegisterClass } from "../lib"
import { LoopTask, submitTask } from "../lib/task"
import { L_GuiTasks } from "../locale"
import {
  deleteAllHighlights,
  makeSettingsRemnantHighlights,
  updateAllHighlights,
  updateHighlightsOnReviveSettingsRemnant,
} from "./entity-highlights"
import { Project } from "./ProjectDef"

export type ProjectEntityDollyResult =
  | EntityDollyResult
  | "cannot-move"
  | "entities-missing"
  | "connected-entities-missing"

/** @noSelf */
export interface WorldEntityUpdates {
  updateWorldEntities(
    project: Project,
    entity: ProjectEntity,
    startStage: StageNumber,
    updateHighlights?: boolean,
  ): void
  updateWorldEntitiesOnLastStageChanged(project: Project, entity: ProjectEntity, oldLastStage: StageNumber | nil): void
  updateNewWorldEntitiesWithoutWires(project: Project, entity: ProjectEntity): void

  updateWireConnections(project: Project, entity: ProjectEntity): void
  clearWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void
  refreshWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void
  refreshAllWorldEntities(project: Project, entity: ProjectEntity): void

  makeSettingsRemnant(project: Project, entity: ProjectEntity): void
  reviveSettingsRemnant(project: Project, entity: ProjectEntity): void

  rebuildWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void

  disableAllEntitiesInStage(project: Project, stage: StageNumber): void
  enableAllEntitiesInStage(project: Project, stage: StageNumber): void
  deleteWorldEntities(project: Project, entity: ProjectEntity): void
  tryDollyEntities(project: Project, entity: ProjectEntity, stage: StageNumber): ProjectEntityDollyResult
  resetUnderground(project: Project, entity: UndergroundBeltProjectEntity, stage: StageNumber): void

  rebuildStage(project: Project, stage: StageNumber): void
  rebuildAllStages(project: Project): void
}

@RegisterClass("RebuildAllStagesTask")
class RebuildAllStagesTask extends LoopTask {
  constructor(private project: Project) {
    super(project.numStages())
  }
  public override getTitle(): LocalisedString {
    return [L_GuiTasks.RebuildAllStages]
  }
  protected override doStep(i: number): void {
    this.project.entityUpdates.rebuildStage(this.project, i + 1)
  }
  protected getTitleForStep(step: number): LocalisedString {
    return [L_GuiTasks.RebuildingStage, this.project.getStageName(step + 1)]
  }
}

export function WorldEntityUpdates(): WorldEntityUpdates {
  function makePreviewEntity(
    project: Project,
    stage: StageNumber,
    entity: ProjectEntity,
    direction: defines.direction,
    previewName: string, // preview name is passed to avoid extra string concatenation
  ): void {
    const existing = entity.getWorldOrPreviewEntity(stage)
    if (existing && existing.name == previewName) {
      existing.direction = direction
    } else {
      const previewEntity = createPreviewEntity(project.getSurface(stage)!, entity.position, direction, previewName)
      entity.replaceWorldOrPreviewEntity(stage, previewEntity)
    }
  }

  function clearWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void {
    const previewName = Prototypes.PreviewEntityPrefix + entity.firstValue.name
    makePreviewEntity(project, stage, entity, entity.getPreviewDirection(), previewName)
    updateAllHighlights(project, entity)
  }
  function setEntityUpdateable(entity: LuaEntity, updateable: boolean) {
    entity.minable = updateable
    entity.rotatable = updateable
    entity.destructible = false
  }

  function updateWorldEntitiesInRange(
    project: Project,
    entity: ProjectEntity,
    startStage: StageNumber,
    endStage: StageNumber,
  ): boolean {
    assert(startStage >= 1)
    const { firstStage, lastStage, direction } = entity
    const previewDirection = entity.getPreviewDirection()

    if (startStage == firstStage) startStage = 1 // also update all previews if first stage edited
    if (lastStage && lastStage > endStage) endStage = lastStage

    // performance: cache stuff to avoid extra string concatenation
    let lastEntityName: string | nil = nil
    let lastPreviewName: string

    let hasOrResolvedError = false

    let updatedNeighbors: LuaSet<ProjectEntity> | nil

    for (const [stage, value, changed] of entity.iterateValues(startStage, endStage)) {
      const surface = project.getSurface(stage)!
      const existing = entity.getWorldOrPreviewEntity(stage)
      const wasPreviewEntity = existing && isPreviewEntity(existing)
      const existingNormalEntity = !wasPreviewEntity && existing

      if (value != nil) {
        // create entity or updating existing entity
        let luaEntity: LuaEntity | nil
        if (existingNormalEntity) {
          let updatedNeighbor: ProjectEntity | nil
          ;[luaEntity, updatedNeighbor] = updateEntity(existingNormalEntity, value, direction, changed)
          if (updatedNeighbor) {
            updatedNeighbors ??= new LuaSet()
            updatedNeighbors.add(updatedNeighbor)
          }
        } else {
          luaEntity = createEntity(surface, entity.position, direction, value, changed)
        }

        if (luaEntity) {
          setEntityUpdateable(luaEntity, stage == firstStage)
          entity.replaceWorldOrPreviewEntity(stage, luaEntity)
          // now is not preview entity, so error state changed
          if (wasPreviewEntity) hasOrResolvedError = true

          continue
        }
        // else, could not create entity, fall through to make preview

        // if we have to make any error entity (where before was not), then error state changed
        hasOrResolvedError = true
      }

      // preview
      const entityName = (value ?? entity.firstValue).name
      if (entityName != lastEntityName) {
        lastEntityName = entityName
        lastPreviewName = Prototypes.PreviewEntityPrefix + entityName
      }
      makePreviewEntity(project, stage, entity, previewDirection, lastPreviewName!)
    }

    // kinda hacky spot for this, but no better place as of now
    if (updatedNeighbors) {
      for (const neighbor of updatedNeighbors) {
        updateAllHighlights(project, neighbor)
      }
    }

    return hasOrResolvedError
  }

  function updateWires(project: Project, entity: ProjectEntity, startStage: StageNumber): void {
    const content = project.content
    const lastStage = project.lastStageFor(entity)
    for (const stage of $range(startStage, lastStage)) {
      updateWireConnectionsAtStage(content, entity, stage)
    }
  }

  function updateWorldEntities(
    project: Project,
    entity: ProjectEntity,
    startStage: StageNumber,
    updateHighlights: boolean = true,
  ): void {
    if (entity.isSettingsRemnant) return makeSettingsRemnant(project, entity)
    const lastStage = project.lastStageFor(entity)
    if (lastStage < startStage) return
    updateWorldEntitiesInRange(project, entity, startStage, lastStage)
    updateWires(project, entity, startStage)
    if (updateHighlights) updateAllHighlights(project, entity)
  }
  // extra hot path
  function updateNewWorldEntitiesWithoutWires(project: Project, entity: ProjectEntity): void {
    const hasError = updateWorldEntitiesInRange(project, entity, 1, project.lastStageFor(entity))
    // performance: if there are no errors, then there are no highlights to update
    // (no stage diff or last stage, either)
    if (hasError) updateAllHighlights(project, entity)
  }

  function refreshWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void {
    if (entity.isPastLastStage(stage)) {
      entity.destroyWorldOrPreviewEntity(stage)
      return
    }

    if (!entity.isInStage(stage)) {
      makePreviewEntity(
        project,
        stage,
        entity,
        entity.getPreviewDirection(),
        Prototypes.PreviewEntityPrefix + entity.getNameAtStage(stage),
      )
      return
    }
    if (entity.isSettingsRemnant) {
      entity.destroyWorldOrPreviewEntity(stage)
      makePreviewEntity(project, stage, entity, entity.getPreviewDirection(), entity.getNameAtStage(stage))
      makeSettingsRemnantHighlights(project, entity)
      return
    }

    updateWorldEntitiesInRange(project, entity, stage, stage)
    // updateWiresInRange(project, entity, stage, stage)
    updateWireConnectionsAtStage(project.content, entity, stage)
    updateAllHighlights(project, entity)
  }
  /**
   * Forces change even if that would make the pair incorrect
   */
  function resetUnderground(project: Project, entity: UndergroundBeltProjectEntity, stage: StageNumber): void {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)
    if (worldEntity && worldEntity.belt_to_ground_type != entity.firstValue.type) {
      forceFlipUnderground(worldEntity)
    }
    updateWorldEntitiesInRange(project, entity, stage, stage)
    updateAllHighlights(project, entity)
  }

  function rebuildWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void {
    entity.destroyWorldOrPreviewEntity(stage)
    refreshWorldEntityAtStage(project, entity, stage)
  }

  function updateWorldEntitiesOnLastStageChanged(
    project: Project,
    entity: ProjectEntity,
    oldLastStage: StageNumber | nil,
  ): void {
    const movedDown = entity.lastStage != nil && (oldLastStage == nil || entity.lastStage < oldLastStage)
    if (movedDown) {
      // delete all entities after the new last stage
      for (const stage of $range(entity.lastStage + 1, oldLastStage ?? project.numStages())) {
        entity.destroyWorldOrPreviewEntity(stage)
      }
    } else if (oldLastStage) {
      // moved up
      updateWorldEntities(project, entity, oldLastStage + 1)
    }
    updateAllHighlights(project, entity)
  }

  function updateWireConnections(project: Project, entity: ProjectEntity): void {
    updateWires(project, entity, entity.firstStage)
  }

  function refreshAllWorldEntities(project: Project, entity: ProjectEntity): void {
    return updateWorldEntities(project, entity, 1)
  }

  function makeSettingsRemnant(project: Project, entity: ProjectEntity): void {
    assert(entity.isSettingsRemnant)
    entity.destroyAllWorldOrPreviewEntities()
    const direction = entity.getPreviewDirection()
    const previewName = Prototypes.PreviewEntityPrefix + entity.firstValue.name
    for (const stage of $range(1, project.lastStageFor(entity))) {
      makePreviewEntity(project, stage, entity, direction, previewName)
    }
    makeSettingsRemnantHighlights(project, entity)
  }

  function reviveSettingsRemnant(project: Project, entity: ProjectEntity): void {
    assert(!entity.isSettingsRemnant)
    const lastStage = project.lastStageFor(entity)
    updateWorldEntitiesInRange(project, entity, 1, lastStage)
    updateWires(project, entity, 1)

    updateHighlightsOnReviveSettingsRemnant(project, entity)
  }

  function deleteUndergroundBelt(entity: ProjectEntity, project: Project): void {
    const pairsToUpdate = new LuaSet<UndergroundBeltProjectEntity>()
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = entity.getWorldOrPreviewEntity(stage)
      if (!worldEntity) continue
      const pair = worldEntity.neighbours as LuaEntity | nil
      if (!pair) continue
      const pairProjectEntity = project.content.findCompatibleWithLuaEntity(pair, nil, stage)
      if (pairProjectEntity) pairsToUpdate.add(pairProjectEntity as UndergroundBeltProjectEntity)
    }
    entity.destroyAllWorldOrPreviewEntities()
    for (const pair of pairsToUpdate) {
      updateAllHighlights(project, pair)
    }
  }
  function deleteWorldEntities(project: Project, entity: ProjectEntity): void {
    if (entity.isUndergroundBelt()) {
      deleteUndergroundBelt(entity, project)
    } else {
      entity.destroyAllWorldOrPreviewEntities()
    }
    deleteAllHighlights(entity)
  }

  function checkConnectionWorldEntityExists(
    content: ProjectContent,
    entity: ProjectEntity,
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

  function tryMoveOtherEntities(
    project: Project,
    entity: ProjectEntity,
    stage: StageNumber,
    movedEntity: LuaEntity,
  ): ProjectEntityDollyResult {
    if (entity.isUndergroundBelt() || entity.firstStage != stage) return "cannot-move"

    if (!checkConnectionWorldEntityExists(project.content, entity, stage, project.lastStageFor(entity)))
      return "connected-entities-missing"

    const entities: LuaEntity[] = []
    for (const stageNum of $range(1, entity.firstStage - 1)) {
      entities.push(entity.getWorldOrPreviewEntity(stageNum)!)
    }
    for (const stageNum of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = entity.getWorldOrPreviewEntity(stageNum)
      if (!worldEntity) return "entities-missing"
      entities.push(worldEntity)
    }

    return tryDollyAllEntities(entities, movedEntity.position, movedEntity.direction)
  }

  function tryDollyEntities(project: Project, entity: ProjectEntity, stage: StageNumber): ProjectEntityDollyResult {
    const movedEntity = entity.getWorldOrPreviewEntity(stage)
    if (!movedEntity) return "entities-missing"
    const moveResult = tryMoveOtherEntities(project, entity, stage, movedEntity)
    if (moveResult != "success") {
      forceDollyEntity(movedEntity, entity.position, entity.direction)
    } else {
      entity.direction = movedEntity.direction
      const posChanged = project.content.changePosition(entity, movedEntity.position)
      assert(posChanged, "failed to change position in project content")
      deleteAllHighlights(entity)
      updateAllHighlights(project, entity)
    }

    return moveResult
  }
  function disableAllEntitiesInStage(project: Project, stage: StageNumber): void {
    const surface = project.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = false
    }
  }
  function enableAllEntitiesInStage(project: Project, stage: StageNumber): void {
    const surface = project.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = true
    }
  }

  function rebuildStage(project: Project, stage: StageNumber): void {
    const surface = project.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) entity.destroy()
    }
    for (const entity of surface.find_entities_filtered({
      type: ["simple-entity-with-owner", "rail-remnants"],
    })) {
      if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
      // see also: isPreviewEntity
    }
    const updateLater: RollingStockProjectEntity[] = []
    for (const entity of project.content.iterateAllEntities()) {
      if (entity.isRollingStock()) {
        updateLater.push(entity)
      } else {
        project.entityUpdates.refreshWorldEntityAtStage(project, entity, stage)
      }
    }
    for (const entity of updateLater) {
      project.entityUpdates.refreshWorldEntityAtStage(project, entity, stage)
    }
  }

  function rebuildAllStages(project: Project): void {
    submitTask(new RebuildAllStagesTask(project))
  }

  return {
    updateWorldEntities,
    updateWorldEntitiesOnLastStageChanged,
    updateWireConnections,
    updateNewWorldEntitiesWithoutWires,
    makeSettingsRemnant,
    reviveSettingsRemnant,
    clearWorldEntityAtStage,
    refreshWorldEntityAtStage,
    refreshAllWorldEntities,
    rebuildWorldEntityAtStage,
    rebuildStage,
    disableAllEntitiesInStage,
    enableAllEntitiesInStage,
    deleteWorldEntities,
    tryDollyEntities,
    resetUnderground,
    rebuildAllStages,
  }
}

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
} from "../entity/ProjectEntity"
import { createEntity, createPreviewEntity, updateEntity } from "../entity/save-load"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { RegisterClass } from "../lib"
import { LoopTask, submitTask } from "../lib/task"
import { L_GuiTasks } from "../locale"
import {
  deleteAllHighlights,
  makeSettingsRemnantHighlights,
  updateAllHighlights,
  updateHighlightsOnSettingsRemnantRevived,
} from "./entity-highlights"
import { Project } from "./ProjectDef"

export type ProjectEntityDollyResult =
  | EntityDollyResult
  | "cannot-move"
  | "entities-missing"
  | "connected-entities-missing"

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

export function clearWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void {
  const previewName = Prototypes.PreviewEntityPrefix + entity.firstValue.name
  makePreviewEntity(project, stage, entity, entity.getPreviewDirection(), previewName)
  updateAllHighlights(project, entity)
}

function makeEntityUneditable(entity: LuaEntity) {
  entity.minable = false
  entity.rotatable = false
  entity.destructible = false
}
function makeEntityEditable(entity: LuaEntity) {
  entity.minable = true
  entity.rotatable = true
  entity.destructible = false
}

/**
 * Returns if has error or resolved error (should update error highlights)
 */
function tryUpdateWorldEntitiesInRange(
  project: Project,
  entity: ProjectEntity,
  startStage: StageNumber,
  endStage: StageNumber,
  updateFirstStage: boolean = true,
): boolean {
  assert(startStage >= 1)
  const { firstStage, lastStage } = entity
  const direction = entity.direction
  const previewDirection = entity.getPreviewDirection()

  if (startStage == firstStage) startStage = 1 // also update all previews if first stage edited
  if (lastStage && lastStage > endStage) endStage = lastStage

  // performance: cache stuff to avoid extra string concatenation
  let lastEntityName: string | nil = nil
  let lastPreviewName: string

  let hasOrResolvedError = false

  for (const [stage, value] of entity.iterateValues(startStage, endStage)) {
    if (!updateFirstStage && stage == firstStage) continue
    const surface = project.getSurface(stage)!
    const existing = entity.getWorldOrPreviewEntity(stage)
    const wasPreviewEntity = existing && isPreviewEntity(existing)
    const existingNormalEntity = !wasPreviewEntity && existing

    if (value != nil) {
      // create entity or updating existing entity
      let luaEntity: LuaEntity | nil
      if (existingNormalEntity) {
        luaEntity = updateEntity(existingNormalEntity, value, direction)
      } else {
        luaEntity = createEntity(surface, entity.position, direction, value)
      }

      if (luaEntity) {
        if (stage != firstStage) makeEntityUneditable(luaEntity)
        else makeEntityEditable(luaEntity)

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

  return hasOrResolvedError
}

function updateWiresInRange(
  project: Project,
  entity: ProjectEntity,
  startStage: StageNumber,
  endStage: StageNumber,
): void {
  const content = project.content
  for (const stage of $range(startStage, endStage)) {
    const worldEntity = entity.getWorldEntity(stage)
    if (worldEntity) {
      updateWireConnectionsAtStage(content, entity, stage)
    }
  }
}

export function updateWorldEntities(
  project: Project,
  entity: ProjectEntity,
  startStage: StageNumber,
  updateWires = true,
): void {
  if (entity.isSettingsRemnant) return makeSettingsRemnant(project, entity)
  const lastStage = project.lastStageFor(entity)
  tryUpdateWorldEntitiesInRange(project, entity, startStage, lastStage)
  if (updateWires) updateWiresInRange(project, entity, startStage, lastStage)
  updateAllHighlights(project, entity)
}

export function updateWorldEntitiesOnLastStageChanged(
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
    updateWorldEntities(project, entity, oldLastStage + 1)
  }
  updateAllHighlights(project, entity)
}

// extra hot path
export function updateNewWorldEntitiesWithoutWires(
  project: Project,
  entity: ProjectEntity,
  updateFirstStage: boolean,
): void {
  // performance: maybe don't need to entity at firstStage if it's new (entity is guaranteed to match firstValue)
  const hasError = tryUpdateWorldEntitiesInRange(project, entity, 1, project.lastStageFor(entity), updateFirstStage)
  // performance: if there are no errors, then there are no highlights to update
  // (no stage diff, last stage, either)
  if (hasError) updateAllHighlights(project, entity)
}

export function refreshWorldEntityAtStage(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
  updateHighlights: boolean = true,
): void {
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

  tryUpdateWorldEntitiesInRange(project, entity, stage, stage)
  updateWiresInRange(project, entity, stage, stage)
  if (updateHighlights) updateAllHighlights(project, entity)
}

export function rebuildWorldEntityAtStage(project: Project, entity: ProjectEntity, stage: StageNumber): void {
  entity.destroyWorldOrPreviewEntity(stage)
  refreshWorldEntityAtStage(project, entity, stage)
}

export function updateWireConnections(project: Project, entity: ProjectEntity): void {
  updateWiresInRange(project, entity, entity.firstStage, project.lastStageFor(entity))
}

export function refreshAllWorldEntities(project: Project, entity: ProjectEntity): void {
  return updateWorldEntities(project, entity, 1)
}

export function makeSettingsRemnant(project: Project, entity: ProjectEntity): void {
  assert(entity.isSettingsRemnant)
  entity.destroyAllWorldOrPreviewEntities()
  const direction = entity.getPreviewDirection()
  const previewName = Prototypes.PreviewEntityPrefix + entity.firstValue.name
  for (const stage of $range(1, project.lastStageFor(entity))) {
    makePreviewEntity(project, stage, entity, direction, previewName)
  }
  makeSettingsRemnantHighlights(project, entity)
}

export function updateEntitiesOnSettingsRemnantRevived(project: Project, entity: ProjectEntity): void {
  assert(!entity.isSettingsRemnant)
  const lastStage = project.lastStageFor(entity)
  tryUpdateWorldEntitiesInRange(project, entity, 1, lastStage)
  updateWiresInRange(project, entity, 1, lastStage)

  updateHighlightsOnSettingsRemnantRevived(project, entity)
}

export function deleteAllEntities(entity: ProjectEntity): void {
  entity.destroyAllWorldOrPreviewEntities()
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

export function tryDollyEntities(
  project: Project,
  entity: ProjectEntity,
  stage: StageNumber,
): ProjectEntityDollyResult {
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

export function rebuildStage(project: Project, stage: StageNumber): void {
  const surface = project.getSurface(stage)
  if (!surface) return
  for (const entity of surface.find_entities()) {
    if (isWorldEntityProjectEntity(entity)) entity.destroy()
  }
  for (const entity of surface.find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
  })) {
    if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
  }
  const updateLater: RollingStockProjectEntity[] = []
  for (const entity of project.content.iterateAllEntities()) {
    if (entity.isRollingStock()) {
      updateLater.push(entity)
    } else {
      refreshWorldEntityAtStage(project, entity, stage)
    }
  }
  for (const entity of updateLater) {
    refreshWorldEntityAtStage(project, entity, stage)
  }
}

export function disableAllEntitiesInStage(project: Project, stage: StageNumber): void {
  const surface = project.getSurface(stage)
  if (!surface) return
  const arr = surface.find_entities()
  for (const i of $range(1, arr.length)) {
    arr[i - 1].active = false
  }
}
export function enableAllEntitiesInStage(project: Project, stage: StageNumber): void {
  const surface = project.getSurface(stage)
  if (!surface) return
  const arr = surface.find_entities()
  for (const i of $range(1, arr.length)) {
    arr[i - 1].active = true
  }
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
    rebuildStage(this.project, i + 1)
  }
  protected getTitleForStep(step: number): LocalisedString {
    return [L_GuiTasks.RebuildingStage, this.project.getStageName(step + 1)]
  }
}

export function rebuildAllStages(project: Project): void {
  submitTask(new RebuildAllStagesTask(project))
}

export const _mockable = true

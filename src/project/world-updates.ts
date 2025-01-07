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

import { LocalisedString, LuaEntity, TilePosition, TileWrite } from "factorio:runtime"
import { Prototypes } from "../constants"
import {
  isWorldEntityProjectEntity,
  ProjectEntity,
  RollingStockProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import { ProjectTile } from "../entity/ProjectTile"
import { isPreviewEntity, OnPrototypeInfoLoaded, PrototypeInfo, rollingStockTypes } from "../entity/prototype-info"
import { createEntity, createPreviewEntity, forceFlipUnderground, updateEntity } from "../entity/save-load"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { Mutable, PRecord, RegisterClass } from "../lib"
import { LoopTask, submitTask } from "../lib/task"
import { L_GuiTasks } from "../locale"
import { EntityHighlights } from "./entity-highlights"
import { Project } from "./ProjectDef"
import { EntityType } from "factorio:prototype"

/** @noSelf */
export interface WorldUpdates {
  updateWorldEntities(entity: ProjectEntity, startStage: StageNumber, updateHighlights?: boolean): void
  updateWorldEntitiesOnLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void
  updateNewWorldEntitiesWithoutWires(entity: ProjectEntity): void

  updateWireConnections(entity: ProjectEntity): void

  clearWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void

  refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void
  refreshAllWorldEntities(entity: ProjectEntity): void

  rebuildWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void

  makeSettingsRemnant(entity: ProjectEntity): void
  reviveSettingsRemnant(entity: ProjectEntity): void

  disableAllEntitiesInStage(stage: StageNumber): void
  enableAllEntitiesInStage(stage: StageNumber): void

  deleteWorldEntities(entity: ProjectEntity): void

  resetUnderground(entity: UndergroundBeltProjectEntity, stage: StageNumber): void

  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void

  updateTilesInVisibleStages(tile: ProjectTile): void
  updateTileAtStage(tile: ProjectTile, stage: StageNumber): void
  updateTilesOnMovedUp(tile: ProjectTile, oldFirstStage: StageNumber): void
  resetTiles(tile: ProjectTile, ignoreFirstStage: boolean): void

  // passed from EntityHighlights
  updateAllHighlights(entity: ProjectEntity): void
}

@RegisterClass("RebuildAllStagesTask")
class RebuildAllStagesTask extends LoopTask {
  constructor(private project: Project) {
    super(project.numStages())
  }
  override getTitle(): LocalisedString {
    return [L_GuiTasks.RebuildAllStages]
  }
  protected override doStep(i: number): void {
    this.project.worldUpdates.rebuildStage(i + 1)
  }
  protected getTitleForStep(step: number): LocalisedString {
    return [L_GuiTasks.RebuildingStage, this.project.getStageName(step + 1)]
  }
}

const raise_script_set_tiles = script.raise_script_set_tiles
const raise_destroy = script.raise_script_destroy

let nameToType: PrototypeInfo["nameToType"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
})

export function WorldUpdates(project: Project, highlights: EntityHighlights): WorldUpdates {
  const content = project.content
  const {
    updateAllHighlights,
    deleteAllHighlights,
    makeSettingsRemnantHighlights,
    updateHighlightsOnReviveSettingsRemnant,
  } = highlights

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
    resetUnderground,
    rebuildAllStages,
    updateAllHighlights,
    updateTilesInVisibleStages,
    updateTileAtStage,
    updateTilesOnMovedUp,
    resetTiles,
  }

  function makePreviewEntity(
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

  function clearWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    const previewName = Prototypes.PreviewEntityPrefix + entity.getPropAtStage(stage, "name")[0]
    makePreviewEntity(stage, entity, entity.getPreviewDirection(), previewName)
    updateAllHighlights(entity)
  }
  function setEntityUpdateable(entity: LuaEntity, updateable: boolean) {
    entity.minable = updateable
    entity.rotatable = updateable
    entity.destructible = false
  }

  function updateWorldEntitiesInRange(entity: ProjectEntity, startStage: StageNumber, endStage: StageNumber): boolean {
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
      makePreviewEntity(stage, entity, previewDirection, lastPreviewName!)
    }

    // kinda hacky spot for this, but no better place as of now
    if (updatedNeighbors) {
      for (const neighbor of updatedNeighbors) {
        updateAllHighlights(neighbor)
      }
    }

    return hasOrResolvedError
  }

  function updateWires(entity: ProjectEntity, startStage: StageNumber): void {
    const lastStage = project.lastStageFor(entity)
    for (const stage of $range(startStage, lastStage)) {
      updateWireConnectionsAtStage(content, entity, stage)
    }
  }

  function updateWorldEntities(entity: ProjectEntity, startStage: StageNumber, updateHighlights: boolean = true): void {
    if (entity.isSettingsRemnant) return makeSettingsRemnant(entity)
    const lastStage = project.lastStageFor(entity)
    if (lastStage < startStage) return
    updateWorldEntitiesInRange(entity, startStage, lastStage)
    updateWires(entity, startStage)
    if (updateHighlights) updateAllHighlights(entity)
  }
  // extra hot path
  function updateNewWorldEntitiesWithoutWires(entity: ProjectEntity): void {
    const hasError = updateWorldEntitiesInRange(entity, 1, project.lastStageFor(entity))
    // performance: if there are no errors, then there are no highlights to update
    // (no stage diff or last stage, either)
    if (hasError) updateAllHighlights(entity)
  }

  function refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    if (entity.isPastLastStage(stage)) {
      entity.destroyWorldOrPreviewEntity(stage)
      return
    }

    if (!entity.isInStage(stage)) {
      makePreviewEntity(
        stage,
        entity,
        entity.getPreviewDirection(),
        Prototypes.PreviewEntityPrefix + entity.getPropAtStage(stage, "name")[0],
      )
      return
    }
    if (entity.isSettingsRemnant) {
      entity.destroyWorldOrPreviewEntity(stage)
      makePreviewEntity(stage, entity, entity.getPreviewDirection(), entity.getPropAtStage(stage, "name")[0])
      makeSettingsRemnantHighlights(entity)
      return
    }

    updateWorldEntitiesInRange(entity, stage, stage)
    updateWireConnectionsAtStage(content, entity, stage)
    updateAllHighlights(entity)
  }
  /**
   * Forces change even if that would make the pair incorrect
   */
  function resetUnderground(entity: UndergroundBeltProjectEntity, stage: StageNumber): void {
    const worldEntity = entity.getWorldOrPreviewEntity(stage)
    if (worldEntity && worldEntity.belt_to_ground_type != entity.firstValue.type) {
      forceFlipUnderground(worldEntity)
    }
    updateWorldEntitiesInRange(entity, stage, stage)
    updateAllHighlights(entity)
  }

  function rebuildWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    entity.destroyWorldOrPreviewEntity(stage)
    refreshWorldEntityAtStage(entity, stage)
  }

  function updateWorldEntitiesOnLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void {
    const movedDown = entity.lastStage != nil && (oldLastStage == nil || entity.lastStage < oldLastStage)
    if (movedDown) {
      // delete all entities after the new last stage
      for (const stage of $range(entity.lastStage + 1, oldLastStage ?? project.numStages())) {
        entity.destroyWorldOrPreviewEntity(stage)
      }
    } else if (oldLastStage) {
      // moved up
      updateWorldEntities(entity, oldLastStage + 1)
    }
    updateAllHighlights(entity)
  }

  function updateWireConnections(entity: ProjectEntity): void {
    updateWires(entity, entity.firstStage)
  }

  function refreshAllWorldEntities(entity: ProjectEntity): void {
    return updateWorldEntities(entity, 1)
  }

  function makeSettingsRemnant(entity: ProjectEntity): void {
    assert(entity.isSettingsRemnant)
    entity.destroyAllWorldOrPreviewEntities()
    const direction = entity.getPreviewDirection()
    const previewName = Prototypes.PreviewEntityPrefix + entity.firstValue.name
    for (const stage of $range(1, project.lastStageFor(entity))) {
      makePreviewEntity(stage, entity, direction, previewName)
    }
    makeSettingsRemnantHighlights(entity)
  }

  function reviveSettingsRemnant(entity: ProjectEntity): void {
    assert(!entity.isSettingsRemnant)
    const lastStage = project.lastStageFor(entity)
    updateWorldEntitiesInRange(entity, 1, lastStage)
    updateWires(entity, 1)

    updateHighlightsOnReviveSettingsRemnant(entity)
  }

  function deleteUndergroundBelt(entity: ProjectEntity, project: Project): void {
    const pairsToUpdate = new LuaSet<UndergroundBeltProjectEntity>()
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = entity.getWorldEntity(stage)
      if (!worldEntity) continue
      const pair = worldEntity.neighbours as LuaEntity | nil
      if (!pair) continue
      const pairProjectEntity = content.findCompatibleWithLuaEntity(pair, nil, stage)
      if (pairProjectEntity) pairsToUpdate.add(pairProjectEntity as UndergroundBeltProjectEntity)
    }
    entity.destroyAllWorldOrPreviewEntities()
    for (const pair of pairsToUpdate) {
      updateAllHighlights(pair)
    }
  }
  function deleteWorldEntities(entity: ProjectEntity): void {
    if (entity.isUndergroundBelt()) {
      deleteUndergroundBelt(entity, project)
    } else {
      entity.destroyAllWorldOrPreviewEntities()
    }
    deleteAllHighlights(entity)
  }

  function disableAllEntitiesInStage(stage: StageNumber): void {
    const surface = project.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = false
    }
  }
  function enableAllEntitiesInStage(stage: StageNumber): void {
    const surface = project.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = true
    }
  }

  function rebuildStage(stage: StageNumber): void {
    const surface = project.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) {
        raise_destroy({ entity })
        entity.destroy()
      }
    }
    for (const entity of surface.find_entities_filtered({
      type: ["simple-entity-with-owner", "rail-remnants"],
    })) {
      if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
      // see also: isPreviewEntity
    }
    // rebuild order: everything, elevated rails, rolling stock
    const elevatedRails: ProjectEntity[] = []
    const rollingStock: RollingStockProjectEntity[] = []
    const elevatedRailTypes = newLuaSet<EntityType>(
      "elevated-straight-rail",
      "elevated-half-diagonal-rail",
      "elevated-curved-rail-a",
      "elevated-curved-rail-b",
    )
    for (const entity of content.allEntities()) {
      const type = nameToType.get(entity.firstValue.name) ?? ""
      if (type in elevatedRailTypes) {
        elevatedRails.push(entity as RollingStockProjectEntity)
      } else if (type in rollingStockTypes) {
        rollingStock.push(entity as RollingStockProjectEntity)
      } else {
        refreshWorldEntityAtStage(entity, stage)
      }
    }
    for (const entity of elevatedRails) {
      refreshWorldEntityAtStage(entity, stage)
    }
    for (const entity of rollingStock) {
      refreshWorldEntityAtStage(entity, stage)
    }
    for (const [, row] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(content.tiles)) {
      for (const [, tile] of pairs(row)) {
        updateTileAtStage(tile, stage)
      }
    }
  }

  function rebuildAllStages(): void {
    submitTask(new RebuildAllStagesTask(project))
  }

  function updateTilesInVisibleStages(tile: ProjectTile): void {
    const position = tile.position
    const tileWrite: Mutable<TileWrite> = {
      position,
      name: tile.firstValue,
    }
    const tileWriteArr = [tileWrite]
    for (const [stage, value] of tile.iterateValues(tile.firstStage, project.lastStageFor(tile))) {
      const surface = project.getSurface(stage)!
      if (value) {
        tileWrite.name = value
        surface.set_tiles(tileWriteArr, true, false)
        raise_script_set_tiles({ tiles: tileWriteArr, surface_index: surface.index })
      }
    }
  }
  function updateTileAtStage(tile: ProjectTile, stage: StageNumber): void {
    const value = tile.getValueAtStage(stage)
    if (!value) return
    const surface = project.getSurface(stage)!
    surface.set_tiles(
      [
        {
          position: tile.position,
          name: value,
        },
      ],
      true,
      false,
    )
  }
  function updateTilesOnMovedUp(tile: ProjectTile, oldFirstStage: StageNumber): void {
    resetTilesInRange(tile.position, oldFirstStage, tile.firstStage - 1)
  }
  function resetTiles(tile: ProjectTile, ignoreFirstStage: boolean): void {
    const startStage = ignoreFirstStage ? tile.firstStage + 1 : tile.firstStage
    resetTilesInRange(tile.position, startStage, project.lastStageFor(tile))
  }
  function resetTilesInRange(position: TilePosition, startStage: StageNumber, endStage: StageNumber): void {
    const tileWrite: Mutable<TileWrite> = {
      position,
      name: nil!,
    }
    const tileWriteArr = [tileWrite]
    for (const stage of $range(startStage, endStage)) {
      const surface = project.getSurface(stage)!
      const tile =
        surface.get_hidden_tile(position) ?? ((position.x + position.y) % 2 == 0 ? "lab-dark-1" : "lab-dark-2")
      tileWrite.name = tile
      surface.set_tiles(tileWriteArr, true, false)
      raise_script_set_tiles({ tiles: tileWriteArr, surface_index: surface.index })
    }
  }
}

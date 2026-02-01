// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaEntity, TileWrite } from "factorio:runtime"
import { Prototypes } from "../constants"
import { UnstagedEntityProps } from "../entity/Entity"
import {
  isWorldEntityProjectEntity,
  MovableProjectEntity,
  ProjectEntity,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import {
  elevatedRailTypes,
  isPreviewEntity,
  movableTypes,
  OnPrototypeInfoLoaded,
  PrototypeInfo,
  tranSignalTypes as trainSignalTypes,
} from "../entity/prototype-info"
import { createEntity, createPreviewEntity, forceFlipUnderground, updateEntity } from "../entity/save-load"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { deepCompare, Mutable, PRecord, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { LoopTask, submitTask } from "../lib/task"
import { L_GuiTasks } from "../locale"
import { ProjectTile } from "../tiles/ProjectTile"
import { withTileEventsDisabled } from "../tiles/tile-events"
import { EntityHighlights } from "./entity-highlights"
import { ProjectBase } from "./Project"

export interface TileCollision {
  stage: StageNumber
  actualValue: string
}

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
  resyncWithWorld(): void

  updateTilesInRange(position: Position, fromStage: StageNumber, toStage: StageNumber | nil): TileCollision | nil

  // passed from EntityHighlights
  updateAllHighlights(entity: ProjectEntity): void
}

@RegisterClass("RebuildAllStagesTask")
class RebuildAllStagesTask extends LoopTask {
  constructor(private project: ProjectBase) {
    super(project.settings.stageCount())
  }
  override getTitle(): LocalisedString {
    return [L_GuiTasks.RebuildAllStages]
  }
  protected override doStep(i: number): void {
    this.project.worldPresentation.rebuildStage(i + 1)
  }
  protected getTitleForStep(step: number): LocalisedString {
    return [L_GuiTasks.RebuildingStage, this.project.settings.getStageName(step + 1)]
  }
}

let worldUpdatesBlocked = false

@RegisterClass("ResyncWithWorldTask")
class ResyncWithWorldTask extends LoopTask {
  constructor(private project: ProjectBase) {
    super(project.settings.stageCount() * 2)
  }

  override getTitle(): LocalisedString {
    return [L_GuiTasks.ResyncWithWorld]
  }

  protected override doStep(i: number): void {
    const numStages = this.project.settings.stageCount()
    if (i < numStages) {
      this.doReadStep(i + 1)
    } else {
      const rebuildStage = i - numStages + 1
      if (rebuildStage == 1) worldUpdatesBlocked = false
      this.project.worldPresentation.rebuildStage(rebuildStage)
    }
  }

  private doReadStep(stage: StageNumber): void {
    if (stage == 1) worldUpdatesBlocked = true
    const surface = this.project.surfaces.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) {
        this.project.actions.onEntityPossiblyUpdated(entity, stage, nil, nil)
      }
    }
  }

  protected getTitleForStep(step: number): LocalisedString {
    const numStages = this.project.settings.stageCount()
    if (step < numStages) {
      return [L_GuiTasks.ReadingStage, this.project.settings.getStageName(step + 1)]
    }
    return [L_GuiTasks.RebuildingStage, this.project.settings.getStageName(step - numStages + 1)]
  }

  override cancel(): void {
    worldUpdatesBlocked = false
  }
}

const raise_destroy = script.raise_script_destroy

let nameToType: PrototypeInfo["nameToType"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
})

export function WorldUpdates(project: ProjectBase, highlights: EntityHighlights): WorldUpdates {
  const content = project.content
  const wp = project.worldPresentation
  const {
    updateAllHighlights,
    deleteAllHighlights,
    makeSettingsRemnantHighlights,
    updateHighlightsOnReviveSettingsRemnant,
  } = highlights

  const deconstructibleTiles = Object.keys(
    prototypes.get_tile_filtered([
      {
        filter: "item-to-place",
      },
    ]),
  )

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
    resyncWithWorld,
    updateAllHighlights: updateAllHighlightsIfNotBlocked,
    updateTilesInRange,
  }

  function resyncWithWorld(): void {
    submitTask(new ResyncWithWorldTask(project))
  }

  function updateAllHighlightsIfNotBlocked(entity: ProjectEntity): void {
    if (worldUpdatesBlocked) return
    updateAllHighlights(entity)
  }

  function makePreviewEntity(
    stage: StageNumber,
    entity: ProjectEntity,
    direction: defines.direction,
    previewName: string, // preview name is passed to avoid extra string concatenation
  ): void {
    const existing = wp.getWorldOrPreviewEntity(entity, stage)
    if (existing && existing.name == previewName) {
      existing.direction = direction
    } else {
      const previewEntity = createPreviewEntity(
        project.surfaces.getSurface(stage)!,
        entity.position,
        direction,
        previewName,
      )
      wp.replaceWorldOrPreviewEntity(entity, stage, previewEntity)
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

    let lastUnstagedValue: UnstagedEntityProps | nil = nil
    for (const [stage, value, diffChanged] of entity.iterateValues(startStage, endStage)) {
      const surface = project.surfaces.getSurface(stage)!
      const existing = wp.getWorldOrPreviewEntity(entity, stage)
      const wasPreviewEntity = existing && isPreviewEntity(existing)
      const existingNormalEntity = !wasPreviewEntity && existing

      const unstagedValue = entity.getUnstagedValue(stage)
      const actuallyChanged = diffChanged || !deepCompare(lastUnstagedValue, unstagedValue)
      lastUnstagedValue = unstagedValue

      if (value != nil) {
        // create entity or updating existing entity
        let luaEntity: LuaEntity | nil
        if (existingNormalEntity) {
          let updatedNeighbor: ProjectEntity | nil
          ;[luaEntity, updatedNeighbor] = updateEntity(
            existingNormalEntity,
            value,
            unstagedValue,
            direction,
            actuallyChanged,
          )
          if (updatedNeighbor) {
            updatedNeighbors ??= new LuaSet()
            updatedNeighbors.add(updatedNeighbor)
          }
        } else {
          luaEntity = createEntity(surface, entity.position, direction, value, unstagedValue, actuallyChanged)
        }

        if (luaEntity) {
          setEntityUpdateable(luaEntity, stage == firstStage)
          wp.replaceWorldOrPreviewEntity(entity, stage, luaEntity)
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
    if (worldUpdatesBlocked) return
    const lastStage = project.lastStageFor(entity)
    for (const stage of $range(startStage, lastStage)) {
      updateWireConnectionsAtStage(content, entity, stage, wp)
    }
  }

  function updateWorldEntities(entity: ProjectEntity, startStage: StageNumber, updateHighlights: boolean = true): void {
    if (worldUpdatesBlocked) return
    if (entity.isSettingsRemnant) return makeSettingsRemnant(entity)
    const lastStage = project.lastStageFor(entity)
    if (lastStage < startStage) return
    updateWorldEntitiesInRange(entity, startStage, lastStage)
    updateWires(entity, startStage)
    if (updateHighlights) updateAllHighlights(entity)
  }

  function updateNewWorldEntitiesWithoutWires(entity: ProjectEntity): void {
    if (worldUpdatesBlocked) return
    const hasError = updateWorldEntitiesInRange(entity, 1, project.lastStageFor(entity))
    // performance: if there are no errors, then there are no highlights to update
    // (no stage diff or last stage, either)
    const mayHaveHighlights = hasError || entity.getPropertyAllStages("unstagedValue") != nil
    if (mayHaveHighlights) updateAllHighlights(entity)
  }

  function refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    if (entity.isPastLastStage(stage)) {
      wp.destroyWorldOrPreviewEntity(entity, stage)
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
      wp.destroyWorldOrPreviewEntity(entity, stage)
      makePreviewEntity(stage, entity, entity.getPreviewDirection(), entity.getPropAtStage(stage, "name")[0])
      makeSettingsRemnantHighlights(entity)
      return
    }

    updateWorldEntitiesInRange(entity, stage, stage)
    updateWireConnectionsAtStage(content, entity, stage, wp)
    updateAllHighlights(entity)
  }
  /**
   * Forces change even if that would make the pair incorrect
   */
  function resetUnderground(entity: UndergroundBeltProjectEntity, stage: StageNumber): void {
    const worldEntity = wp.getWorldOrPreviewEntity(entity, stage)
    if (worldEntity && worldEntity.belt_to_ground_type != entity.firstValue.type) {
      forceFlipUnderground(worldEntity)
    }
    updateWorldEntitiesInRange(entity, stage, stage)
    updateAllHighlights(entity)
  }

  function rebuildWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    wp.destroyWorldOrPreviewEntity(entity, stage)
    refreshWorldEntityAtStage(entity, stage)
  }

  function updateWorldEntitiesOnLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void {
    if (worldUpdatesBlocked) return
    const movedDown = entity.lastStage != nil && (oldLastStage == nil || entity.lastStage < oldLastStage)
    if (movedDown) {
      for (const stage of $range(entity.lastStage + 1, oldLastStage ?? project.settings.stageCount())) {
        wp.destroyWorldOrPreviewEntity(entity, stage)
      }
    } else if (oldLastStage) {
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
    wp.destroyAllWorldOrPreviewEntities(entity)
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

  function deleteUndergroundBelt(entity: ProjectEntity, project: ProjectBase): void {
    const pairsToUpdate = new LuaSet<UndergroundBeltProjectEntity>()
    for (const stage of $range(entity.firstStage, project.lastStageFor(entity))) {
      const worldEntity = wp.getWorldEntity(entity, stage)
      if (!worldEntity) continue
      const pair = worldEntity.neighbours as LuaEntity | nil
      if (!pair) continue
      const pairProjectEntity = content.findCompatibleWithLuaEntity(pair, nil, stage)
      if (pairProjectEntity) pairsToUpdate.add(pairProjectEntity as UndergroundBeltProjectEntity)
    }
    wp.destroyAllWorldOrPreviewEntities(entity)
    for (const pair of pairsToUpdate) {
      updateAllHighlights(pair)
    }
  }
  function deleteWorldEntities(entity: ProjectEntity): void {
    if (entity.isUndergroundBelt()) {
      deleteUndergroundBelt(entity, project)
    } else {
      wp.destroyAllWorldOrPreviewEntities(entity)
    }
    deleteAllHighlights(entity)
  }

  function disableAllEntitiesInStage(stage: StageNumber): void {
    const surface = project.surfaces.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = false
    }
  }
  function enableAllEntitiesInStage(stage: StageNumber): void {
    const surface = project.surfaces.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = true
    }
  }
  function rebuildStage(stage: StageNumber): void {
    const surface = project.surfaces.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) {
        raise_destroy({ entity })
        entity.destroy()
      }
    }

    for (const tile of surface.find_tiles_filtered({
      name: deconstructibleTiles,
    })) {
      updateTilesInRange(tile.position, stage, stage)
    }

    for (const [x, row] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(content.tiles)) {
      for (const [y] of pairs(row)) {
        const position = { x, y }
        updateTilesInRange(position, stage, stage)
      }
    }

    for (const entity of surface.find_entities_filtered({
      type: ["simple-entity-with-owner", "rail-remnants"],
    })) {
      if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
      // see also: isPreviewEntity
    }
    // rebuild order: everything else, elevated rails, rolling stock & signals
    const elevatedRails: ProjectEntity[] = []
    const finalEntities: MovableProjectEntity[] = []

    for (const entity of content.allEntities()) {
      const type = nameToType.get(entity.firstValue.name) ?? ""
      if (type in elevatedRailTypes) {
        elevatedRails.push(entity as MovableProjectEntity)
      } else if (type in movableTypes || type in trainSignalTypes) {
        finalEntities.push(entity as MovableProjectEntity)
      } else {
        refreshWorldEntityAtStage(entity, stage)
      }
    }
    for (const entity of elevatedRails) {
      refreshWorldEntityAtStage(entity, stage)
    }
    for (const entity of finalEntities) {
      refreshWorldEntityAtStage(entity, stage)
    }
  }

  function rebuildAllStages(): void {
    submitTask(new RebuildAllStagesTask(project))
  }

  function updateTilesInRange(
    position: Position,
    fromStage: StageNumber,
    endStage: StageNumber = project.settings.stageCount(),
  ): TileCollision | nil {
    const tile = content.tiles.get(position.x, position.y)

    const tileWrite: Mutable<TileWrite> = { position, name: "" }
    const tileWriteArr = [tileWrite]

    let collision: TileCollision | nil = nil

    withTileEventsDisabled(() => {
      for (let stage = fromStage; stage <= endStage; stage++) {
        const value = tile?.getTileAtStage(stage)
        const surface = project.surfaces.getSurface(stage)!
        if (value != nil) {
          tileWrite.name = value
        } else {
          const defaultTile: string = project.settings.isSpacePlatform()
            ? "empty-space"
            : (surface.get_hidden_tile(position) ?? ((position.x + position.y) % 2 == 0 ? "lab-dark-1" : "lab-dark-2"))
          tileWrite.name = defaultTile
        }
        surface.set_tiles(tileWriteArr, true, "abort_on_collision", true, false)

        const actualTile = surface.get_tile(position.x, position.y)
        const actualValue = actualTile?.name
        if (stage != fromStage && actualValue != tileWrite.name) {
          collision = { stage, actualValue }
          return
        }

        surface.find_entity("tile-ghost", { x: position.x + 0.5, y: position.y + 0.5 })?.destroy()
      }
    })

    return collision
  }
}

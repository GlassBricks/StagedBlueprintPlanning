import { LocalisedString, LuaEntity, MapPosition, nil, TileWrite } from "factorio:runtime"
import { Prototypes } from "../constants"
import { UnstagedEntityProps } from "../entity/Entity"
import { ContentObserver, MutableProjectContent } from "../entity/ProjectContent"
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
import { registerEntity } from "../entity/registration"
import { createEntity, createPreviewEntity, forceFlipUnderground, updateEntity } from "../entity/save-load"
import { updateWireConnectionsAtStage } from "../entity/wires"
import { deepCompare, Mutable, PRecord, RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { LoopTask, submitTask } from "../lib/task"
import { L_GuiTasks } from "../locale"
import { ProjectTile } from "../tiles/ProjectTile"
import { withTileEventsDisabled } from "../tiles/tile-events"
import { EntityHighlights, HasErrorAt, HighlightTypes, SurfaceProvider } from "./EntityHiglights"
import { EntityStorage } from "./EntityStorage"
import { ProjectSettings } from "./ProjectSettings"

export interface WorldEntityLookup {
  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil
  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean
}

export interface WorldPresenter extends WorldEntityLookup {
  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void

  rebuildStage(stage: StageNumber): void
  rebuildAllStages(): void
  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void
  rebuildAllEntitiesTogether(entities: ProjectEntity[]): void
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void
  resetUnderground(entity: ProjectEntity, stage: StageNumber): void

  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil

  disableAllEntitiesInStage(stage: StageNumber): void
  enableAllEntitiesInStage(stage: StageNumber): void
}

export interface TileCollision {
  stage: StageNumber
  actualValue: string
}

export interface WorldEntityTypes extends HighlightTypes {
  worldOrPreviewEntity: LuaEntity
}

let nameToType: PrototypeInfo["nameToType"]
OnPrototypeInfoLoaded.addListener((info) => {
  nameToType = info.nameToType
})

let worldUpdatesBlocked = false

export function _isWorldUpdatesBlocked(): boolean {
  return worldUpdatesBlocked
}

export function _setWorldUpdatesBlocked(value: boolean): void {
  worldUpdatesBlocked = value
}

@RegisterClass("RebuildAllStagesTask")
class RebuildAllStagesTask extends LoopTask {
  constructor(
    private settings: ProjectSettings,
    private worldPresentation: WorldPresentation,
  ) {
    super(settings.stageCount())
  }
  override getTitle(): LocalisedString {
    return [L_GuiTasks.RebuildAllStages]
  }
  protected override doStep(i: number): void {
    this.worldPresentation.rebuildStage(i + 1)
  }
  protected getTitleForStep(step: number): LocalisedString {
    return [L_GuiTasks.RebuildingStage, this.settings.getStageName(step + 1)]
  }
}

const deconstructibleTiles = Object.keys(
  prototypes.get_tile_filtered([
    {
      filter: "item-to-place",
    },
  ]),
)

@RegisterClass("WorldPresentation")
export class WorldPresentation implements WorldEntityLookup, WorldPresenter, HasErrorAt, ContentObserver {
  readonly entityStorage = new EntityStorage<WorldEntityTypes>()
  private highlights: EntityHighlights

  constructor(
    private readonly settings: ProjectSettings,
    private readonly surfaces: SurfaceProvider,
    private readonly content: MutableProjectContent,
  ) {
    this.highlights = new EntityHighlights(surfaces, settings, this, this.entityStorage)
  }

  // === ContentObserver ===

  onEntityAdded(entity: ProjectEntity): void {
    this.updateNewWorldEntitiesWithoutWires(entity)
    this.highlights.updateAllHighlights(entity)
  }

  onEntityDeleted(entity: ProjectEntity): void {
    this.deleteWorldEntities(entity)
  }

  onEntityChanged(entity: ProjectEntity, fromStage: StageNumber): void {
    this.updateWorldEntities(entity, fromStage)
  }

  onEntityLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void {
    this.updateWorldEntitiesOnLastStageChanged(entity, oldLastStage)
  }

  onEntityBecameSettingsRemnant(entity: ProjectEntity): void {
    this.makeSettingsRemnant(entity)
  }

  onEntityRevived(entity: ProjectEntity): void {
    this.reviveSettingsRemnant(entity)
  }

  onWiresChanged(entity: ProjectEntity): void {
    this.updateWireConnections(entity)
    this.highlights.updateAllHighlights(entity)
  }

  onStageDiscarded(
    stageNumber: StageNumber,
    deleted: ProjectEntity[],
    updated: ProjectEntity[],
    updatedTiles: MapPosition[],
  ): void {
    for (const entity of deleted) {
      this.deleteWorldEntities(entity)
    }
    for (const entity of updated) {
      this.updateWorldEntities(entity, stageNumber)
    }
    for (const tilePosition of updatedTiles) {
      this.updateTilesInRange(tilePosition, stageNumber, nil)
    }
  }

  // === WorldEntityLookup ===

  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    return this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
  }

  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    const luaEntity = this.getWorldOrPreviewEntity(entity, stage)
    if (luaEntity && !isPreviewEntity(luaEntity)) return luaEntity
    return nil
  }

  hasErrorAt(entity: ProjectEntity, stage: StageNumber): boolean {
    if (!entity.isInStage(stage)) return false
    const worldEntity = this.getWorldEntity(entity, stage)
    if (worldEntity == nil) return true
    if (worldEntity.type == "underground-belt") {
      const expectedType = (entity as UndergroundBeltProjectEntity).firstValue.type
      return worldEntity.belt_to_ground_type != expectedType
    }
    return false
  }

  // === WorldPresenter ===

  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void {
    this.entityStorage.set(entity, "worldOrPreviewEntity", stage, luaEntity)
    if (luaEntity && movableTypes.has(luaEntity.type)) {
      registerEntity(luaEntity, entity)
    }
  }

  private destroyWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): void {
    this.entityStorage.delete(entity, "worldOrPreviewEntity", stage)
  }

  private destroyAllWorldOrPreviewEntities(entity: ProjectEntity): void {
    this.entityStorage.deleteAllOfType(entity, "worldOrPreviewEntity")
  }

  onStageInserted(stageNumber: StageNumber): void {
    for (const entity of this.content.allEntities()) {
      this.entityStorage.shiftStageKeysUp(entity, stageNumber)
    }
  }

  onStageDeleted(stageNumber: StageNumber): void {
    for (const entity of this.content.allEntities()) {
      this.entityStorage.shiftStageKeysDown(entity, stageNumber)
    }
  }

  rebuildStage(stage: StageNumber): void {
    const surface = this.surfaces.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) {
        script.raise_script_destroy({ entity })
        entity.destroy()
      }
    }

    for (const tile of surface.find_tiles_filtered({
      name: deconstructibleTiles,
    })) {
      this.updateTilesInRange(tile.position, stage, stage)
    }

    for (const [x, row] of pairs<PRecord<number, PRecord<number, ProjectTile>>>(this.content.tiles)) {
      for (const [y] of pairs(row)) {
        const position = { x, y }
        this.updateTilesInRange(position, stage, stage)
      }
    }

    for (const entity of surface.find_entities_filtered({
      type: ["simple-entity-with-owner", "rail-remnants"],
    })) {
      if (entity.name.startsWith(Prototypes.PreviewEntityPrefix)) entity.destroy()
    }
    const elevatedRails: ProjectEntity[] = []
    const finalEntities: MovableProjectEntity[] = []

    for (const entity of this.content.allEntities()) {
      const type = nameToType.get(entity.firstValue.name) ?? ""
      if (type in elevatedRailTypes) {
        elevatedRails.push(entity as MovableProjectEntity)
      } else if (type in movableTypes || type in trainSignalTypes) {
        finalEntities.push(entity as MovableProjectEntity)
      } else {
        this.refreshWorldEntityAtStage(entity, stage)
      }
    }
    for (const entity of elevatedRails) {
      this.refreshWorldEntityAtStage(entity, stage)
    }
    for (const entity of finalEntities) {
      this.refreshWorldEntityAtStage(entity, stage)
    }
  }

  rebuildAllStages(): void {
    submitTask(new RebuildAllStagesTask(this.settings, this))
  }

  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void {
    this.destroyWorldOrPreviewEntity(entity, stage)
    this.refreshWorldEntityAtStage(entity, stage)
  }

  rebuildAllEntitiesTogether(entities: ProjectEntity[]): void {
    for (const entity of entities) this.destroyAllWorldOrPreviewEntities(entity)
    for (const entity of entities) this.updateWorldEntities(entity, 1)
  }

  refreshEntity(entity: ProjectEntity, stage: StageNumber): void {
    this.refreshWorldEntityAtStage(entity, stage)
  }

  refreshAllEntities(entity: ProjectEntity): void {
    this.updateWorldEntities(entity, 1)
  }

  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    const previewName = Prototypes.PreviewEntityPrefix + entity.getPropAtStage(stage, "name")[0]
    this.makePreviewEntity(stage, entity, entity.getPreviewDirection(), previewName)
    this.highlights.updateAllHighlights(entity)
  }

  resetUnderground(entity: ProjectEntity, stage: StageNumber): void {
    const ubEntity = entity as UndergroundBeltProjectEntity
    const worldEntity = this.getWorldOrPreviewEntity(ubEntity, stage)
    if (worldEntity && worldEntity.belt_to_ground_type != ubEntity.firstValue.type) {
      forceFlipUnderground(worldEntity)
    }
    this.updateWorldEntitiesInRange(ubEntity, stage, stage)
    this.highlights.updateAllHighlights(ubEntity)
  }

  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil {
    return this.updateTilesInRange(position, fromStage, nil)
  }

  disableAllEntitiesInStage(stage: StageNumber): void {
    const surface = this.surfaces.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = false
    }
  }

  enableAllEntitiesInStage(stage: StageNumber): void {
    const surface = this.surfaces.getSurface(stage)
    if (!surface) return
    const arr = surface.find_entities()
    for (const i of $range(1, arr.length)) {
      arr[i - 1].active = true
    }
  }

  // === General update methods ===

  updateWorldEntities(entity: ProjectEntity, startStage: StageNumber, updateHighlights: boolean = true): void {
    if (worldUpdatesBlocked) return
    if (entity.isSettingsRemnant) return this.makeSettingsRemnant(entity)
    const lastStage = entity.lastStageWith(this.settings)
    if (lastStage < startStage) return
    this.updateWorldEntitiesInRange(entity, startStage, lastStage)
    this.updateWires(entity, startStage)
    if (updateHighlights) this.highlights.updateAllHighlights(entity)
  }

  updateWorldEntitiesOnLastStageChanged(entity: ProjectEntity, oldLastStage: StageNumber | nil): void {
    if (worldUpdatesBlocked) return
    const movedDown = entity.lastStage != nil && (oldLastStage == nil || entity.lastStage < oldLastStage)
    if (movedDown) {
      for (const stage of $range(entity.lastStage + 1, oldLastStage ?? this.settings.stageCount())) {
        this.destroyWorldOrPreviewEntity(entity, stage)
      }
    } else if (oldLastStage) {
      this.updateWorldEntities(entity, oldLastStage + 1)
      return
    }
    this.highlights.updateAllHighlights(entity)
  }

  updateNewWorldEntitiesWithoutWires(entity: ProjectEntity): void {
    if (worldUpdatesBlocked) return
    this.updateWorldEntitiesInRange(entity, 1, entity.lastStageWith(this.settings))
  }

  updateWireConnections(entity: ProjectEntity): void {
    this.updateWires(entity, entity.firstStage)
  }

  updateAllHighlights(entity: ProjectEntity): void {
    if (worldUpdatesBlocked) return
    this.highlights.updateAllHighlights(entity)
  }

  updateTilesInRange(position: Position, fromStage: StageNumber, endStage: StageNumber | nil): TileCollision | nil {
    const resolvedEndStage = endStage ?? this.settings.stageCount()
    const tile = this.content.tiles.get(position.x, position.y)

    const tileWrite: Mutable<TileWrite> = { position, name: "" }
    const tileWriteArr = [tileWrite]

    let collision: TileCollision | nil = nil

    withTileEventsDisabled(() => {
      for (let stage = fromStage; stage <= resolvedEndStage; stage++) {
        const value = tile?.getTileAtStage(stage)
        const surface = this.surfaces.getSurface(stage)!
        if (value != nil) {
          tileWrite.name = value
        } else {
          const defaultTile: string = this.settings.isSpacePlatform()
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

  // === Private helpers ===

  private makePreviewEntity(
    stage: StageNumber,
    entity: ProjectEntity,
    direction: defines.direction,
    previewName: string,
  ): void {
    const existing = this.getWorldOrPreviewEntity(entity, stage)
    if (existing && existing.name == previewName) {
      existing.direction = direction
    } else {
      const previewEntity = createPreviewEntity(
        this.surfaces.getSurface(stage)!,
        entity.position,
        direction,
        previewName,
      )
      this.replaceWorldOrPreviewEntity(entity, stage, previewEntity)
    }
  }

  private static setEntityUpdateable(entity: LuaEntity, updateable: boolean) {
    entity.minable = updateable
    entity.rotatable = updateable
    entity.destructible = false
  }

  private updateWorldEntitiesInRange(entity: ProjectEntity, startStage: StageNumber, endStage: StageNumber): boolean {
    assert(startStage >= 1)
    const { firstStage, lastStage, direction } = entity
    const previewDirection = entity.getPreviewDirection()

    if (startStage == firstStage) startStage = 1
    if (lastStage && lastStage > endStage) endStage = lastStage

    let lastEntityName: string | nil = nil
    let lastPreviewName: string

    let hasOrResolvedError = false

    let updatedNeighbors: LuaSet<ProjectEntity> | nil

    let lastUnstagedValue: UnstagedEntityProps | nil = nil
    for (const [stage, value, diffChanged] of entity.iterateValues(startStage, endStage)) {
      const surface = this.surfaces.getSurface(stage)!
      const existing = this.getWorldOrPreviewEntity(entity, stage)
      const wasPreviewEntity = existing && isPreviewEntity(existing)
      const existingNormalEntity = !wasPreviewEntity && existing

      const unstagedValue = entity.getUnstagedValue(stage)
      const actuallyChanged = diffChanged || !deepCompare(lastUnstagedValue, unstagedValue)
      lastUnstagedValue = unstagedValue

      if (value != nil) {
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
          WorldPresentation.setEntityUpdateable(luaEntity, stage == firstStage)
          this.replaceWorldOrPreviewEntity(entity, stage, luaEntity)
          if (wasPreviewEntity) hasOrResolvedError = true

          continue
        }

        hasOrResolvedError = true
      }

      const entityName = (value ?? entity.firstValue).name
      if (entityName != lastEntityName) {
        lastEntityName = entityName
        lastPreviewName = Prototypes.PreviewEntityPrefix + entityName
      }
      this.makePreviewEntity(stage, entity, previewDirection, lastPreviewName!)
    }

    if (updatedNeighbors) {
      for (const neighbor of updatedNeighbors) {
        this.highlights.updateAllHighlights(neighbor)
      }
    }

    return hasOrResolvedError
  }

  private updateWires(entity: ProjectEntity, startStage: StageNumber): void {
    if (worldUpdatesBlocked) return
    const lastStage = entity.lastStageWith(this.settings)
    for (const stage of $range(startStage, lastStage)) {
      updateWireConnectionsAtStage(this.content, entity, stage, this)
    }
  }

  private refreshWorldEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    if (entity.isPastLastStage(stage)) {
      this.destroyWorldOrPreviewEntity(entity, stage)
      return
    }

    if (!entity.isInStage(stage)) {
      this.makePreviewEntity(
        stage,
        entity,
        entity.getPreviewDirection(),
        Prototypes.PreviewEntityPrefix + entity.getPropAtStage(stage, "name")[0],
      )
      return
    }
    if (entity.isSettingsRemnant) {
      this.destroyWorldOrPreviewEntity(entity, stage)
      this.makePreviewEntity(stage, entity, entity.getPreviewDirection(), entity.getPropAtStage(stage, "name")[0])
      this.highlights.makeSettingsRemnantHighlights(entity)
      return
    }

    this.updateWorldEntitiesInRange(entity, stage, stage)
    updateWireConnectionsAtStage(this.content, entity, stage, this)
    this.highlights.updateAllHighlights(entity)
  }

  private makeSettingsRemnant(entity: ProjectEntity): void {
    assert(entity.isSettingsRemnant)
    this.destroyAllWorldOrPreviewEntities(entity)
    const direction = entity.getPreviewDirection()
    const previewName = Prototypes.PreviewEntityPrefix + entity.firstValue.name
    for (const stage of $range(1, entity.lastStageWith(this.settings))) {
      this.makePreviewEntity(stage, entity, direction, previewName)
    }
    this.highlights.makeSettingsRemnantHighlights(entity)
  }

  private reviveSettingsRemnant(entity: ProjectEntity): void {
    assert(!entity.isSettingsRemnant)
    const lastStage = entity.lastStageWith(this.settings)
    this.updateWorldEntitiesInRange(entity, 1, lastStage)
    this.updateWires(entity, 1)

    this.highlights.updateHighlightsOnReviveSettingsRemnant(entity)
  }

  private deleteUndergroundBelt(entity: ProjectEntity): void {
    const pairsToUpdate = new LuaSet<UndergroundBeltProjectEntity>()
    for (const stage of $range(entity.firstStage, entity.lastStageWith(this.settings))) {
      const worldEntity = this.getWorldEntity(entity, stage)
      if (!worldEntity) continue
      const pair = worldEntity.neighbours as LuaEntity | nil
      if (!pair) continue
      const pairProjectEntity = this.content.findCompatibleWithLuaEntity(pair, nil, stage)
      if (pairProjectEntity) pairsToUpdate.add(pairProjectEntity as UndergroundBeltProjectEntity)
    }
    this.destroyAllWorldOrPreviewEntities(entity)
    for (const pair of pairsToUpdate) {
      this.highlights.updateAllHighlights(pair)
    }
  }

  private deleteWorldEntities(entity: ProjectEntity): void {
    if (entity.isUndergroundBelt()) {
      this.deleteUndergroundBelt(entity)
    } else {
      this.destroyAllWorldOrPreviewEntities(entity)
    }
    this.highlights.deleteAllHighlights(entity)
  }
}

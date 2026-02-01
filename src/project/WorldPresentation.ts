import { HighlightBoxEntity, LuaEntity, LuaRenderObject, nil } from "factorio:runtime"
import { ProjectEntity, StageNumber, UndergroundBeltProjectEntity } from "../entity/ProjectEntity"
import { isPreviewEntity, movableTypes } from "../entity/prototype-info"
import { RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { registerEntity } from "../entity/registration"
import { EntityHighlights } from "./entity-highlights"
import { EntityStorage } from "./EntityStorage"
import { ProjectBase } from "./Project"
import { TileCollision, WorldUpdates } from "./world-updates"

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
  refreshEntity(entity: ProjectEntity, stage: StageNumber): void
  refreshAllEntities(entity: ProjectEntity): void
  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void
  resetUnderground(entity: ProjectEntity, stage: StageNumber): void

  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil

  disableAllEntitiesInStage(stage: StageNumber): void
  enableAllEntitiesInStage(stage: StageNumber): void
}

export interface WorldEntityTypes {
  worldOrPreviewEntity: LuaEntity
  errorOutline: HighlightBoxEntity
  errorElsewhereIndicator: LuaRenderObject
  settingsRemnantHighlight: HighlightBoxEntity
  configChangedHighlight: HighlightBoxEntity
  configChangedLaterHighlight: LuaRenderObject
  stageDeleteHighlight: LuaRenderObject
  itemRequestHighlight: LuaRenderObject
  itemRequestHighlightOverlay: LuaRenderObject
}

const raise_destroy = script.raise_script_destroy

interface Closures {
  worldUpdates: WorldUpdates
  highlights: EntityHighlights
}

const closureCache = setmetatable(new LuaMap<WorldPresentation, Closures>(), { __mode: "k" })

function getClosures(wp: WorldPresentation): Closures {
  let cached = closureCache.get(wp)
  if (!cached) {
    const highlights = EntityHighlights(wp.project, wp, wp.entityStorage)
    const worldUpdates = WorldUpdates(wp.project, highlights)
    cached = { worldUpdates, highlights }
    closureCache.set(wp, cached)
  }
  return cached
}

@RegisterClass("WorldPresentation")
export class WorldPresentation implements WorldEntityLookup, WorldPresenter {
  readonly entityStorage = new EntityStorage<WorldEntityTypes>()

  constructor(readonly project: ProjectBase) {}

  getWorldUpdates(): WorldUpdates {
    return getClosures(this).worldUpdates
  }

  getHighlights(): EntityHighlights {
    return getClosures(this).highlights
  }

  getWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    const luaEntity = this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
    if (luaEntity && luaEntity.valid) return luaEntity
    if (luaEntity) this.entityStorage.delete(entity, "worldOrPreviewEntity", stage)
    return nil
  }

  getWorldEntity(entity: ProjectEntity, stage: StageNumber): LuaEntity | nil {
    const luaEntity = this.getWorldOrPreviewEntity(entity, stage)
    if (luaEntity && !isPreviewEntity(luaEntity)) return luaEntity
    return nil
  }

  replaceWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber, luaEntity: LuaEntity | nil): void {
    const existing = this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
    if (existing && existing.valid && existing != luaEntity) {
      raise_destroy({ entity: existing })
      existing.destroy()
    }
    this.entityStorage.set(entity, "worldOrPreviewEntity", stage, luaEntity)
    if (luaEntity && movableTypes.has(luaEntity.type)) {
      registerEntity(luaEntity, entity)
    }
  }

  destroyWorldOrPreviewEntity(entity: ProjectEntity, stage: StageNumber): void {
    const existing = this.entityStorage.get(entity, "worldOrPreviewEntity", stage)
    if (existing && existing.valid) {
      raise_destroy({ entity: existing })
      existing.destroy()
    }
    this.entityStorage.delete(entity, "worldOrPreviewEntity", stage)
  }

  destroyAllWorldOrPreviewEntities(entity: ProjectEntity): void {
    for (const [, luaEntity] of this.entityStorage.iterateType(entity, "worldOrPreviewEntity")) {
      if (luaEntity.valid) {
        raise_destroy({ entity: luaEntity })
        luaEntity.destroy()
      }
    }
    this.entityStorage.deleteAllOfType(entity, "worldOrPreviewEntity")
  }

  hasWorldEntityInRange(entity: ProjectEntity, start: StageNumber, end: StageNumber): boolean {
    for (const [stage, luaEntity] of this.entityStorage.iterateType(entity, "worldOrPreviewEntity")) {
      if (stage >= start && stage <= end) {
        if (luaEntity.valid && !isPreviewEntity(luaEntity)) return true
        if (!luaEntity.valid) this.entityStorage.delete(entity, "worldOrPreviewEntity", stage)
      }
    }
    return false
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

  deleteAllForEntity(entity: ProjectEntity): void {
    this.entityStorage.deleteAllForEntity(entity)
  }

  onStageInserted(stageNumber: StageNumber): void {
    for (const entity of this.project.content.allEntities()) {
      this.entityStorage.shiftStageKeysUp(entity, stageNumber)
    }
  }

  onStageDeleted(stageNumber: StageNumber): void {
    for (const entity of this.project.content.allEntities()) {
      this.entityStorage.shiftStageKeysDown(entity, stageNumber)
    }
  }

  rebuildStage(stage: StageNumber): void {
    this.getWorldUpdates().rebuildStage(stage)
  }

  rebuildAllStages(): void {
    this.getWorldUpdates().rebuildAllStages()
  }

  rebuildEntity(entity: ProjectEntity, stage: StageNumber): void {
    this.getWorldUpdates().rebuildWorldEntityAtStage(entity, stage)
  }

  refreshEntity(entity: ProjectEntity, stage: StageNumber): void {
    this.getWorldUpdates().refreshWorldEntityAtStage(entity, stage)
    this.getHighlights().updateAllHighlights(entity)
  }

  refreshAllEntities(entity: ProjectEntity): void {
    this.getWorldUpdates().refreshAllWorldEntities(entity)
  }

  deleteEntityAtStage(entity: ProjectEntity, stage: StageNumber): void {
    this.getWorldUpdates().clearWorldEntityAtStage(entity, stage)
  }

  resetUnderground(entity: ProjectEntity, stage: StageNumber): void {
    this.getWorldUpdates().resetUnderground(entity as UndergroundBeltProjectEntity, stage)
  }

  updateTiles(position: Position, fromStage: StageNumber): TileCollision | nil {
    return this.getWorldUpdates().updateTilesInRange(position, fromStage, nil)
  }

  disableAllEntitiesInStage(stage: StageNumber): void {
    this.getWorldUpdates().disableAllEntitiesInStage(stage)
  }

  enableAllEntitiesInStage(stage: StageNumber): void {
    this.getWorldUpdates().enableAllEntitiesInStage(stage)
  }
}

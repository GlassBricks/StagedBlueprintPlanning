import { BlueprintInsertPlan, LocalisedString, LuaEntity, LuaTrain, PlayerIndex } from "factorio:runtime"
import { Colors, Settings } from "../../constants"
import { Entity, LuaEntityInfo, TrainEntity } from "../../entity/Entity"
import { MutableProjectContent } from "../../entity/ProjectContent"
import {
  getNameAndQuality,
  InserterProjectEntity,
  InternalProjectEntity,
  isWorldEntityProjectEntity,
  LoaderProjectEntity,
  MovableProjectEntity,
  NameAndQuality,
  newProjectEntity,
  ProjectEntity,
  StageNumber,
} from "../../entity/ProjectEntity"
import { allowOverlapDifferentDirection, areUpgradeableTypes } from "../../entity/prototype-info"
import { canBeAnyDirection, saveEntity } from "../../entity/save-load"
import { findUndergroundPair } from "../../entity/underground-belt"
import { saveWireConnections } from "../../entity/wires"
import {
  fromExportStageDiffs,
  parseStagePropertiesExport,
  StageInfoExport,
  StagePropertiesExport,
} from "../../import-export/entity"
import { assertNever, deepCompare, RegisterClass } from "../../lib"
import { Pos, Position } from "../../lib/geometry"
import { LoopTask, submitTask } from "../../lib/task"
import { L_GuiTasks, L_Interaction } from "../../locale"
import { SurfaceProvider } from "../EntityHighlights"
import { ProjectId } from "../Project"
import { ProjectSettings } from "../ProjectSettings"
import { prepareArea } from "../surfaces"
import { _setWorldUpdatesBlocked, WorldPresenter } from "../WorldPresentation"
import { createIndicator, createNotification, notifyIfMoveError, notifyIfUpdateError } from "./notifications"
import * as TileActions from "./tile-actions"
import * as UgActions from "./underground-belt-actions"
import { pushUndo, UndoAction } from "./undo"
import {
  createBringToStageData,
  createDeleteEntityUndoData,
  createLastStageChangeData,
  createSendToStageData,
  createStageMoveData,
  EntityUpdateResult,
  StageMoveResult,
  tagUndoDeleteEntity,
  WireUpdateResult,
} from "./undo-handlers"

export { EntityUpdateResult, StageMoveResult, WireUpdateResult }

@RegisterClass("ProjectActions")
export class ProjectActions {
  valid = true
  projectId!: ProjectId

  constructor(
    readonly content: MutableProjectContent,
    readonly worldPresenter: WorldPresenter,
    readonly settings: ProjectSettings,
    readonly surfaces: SurfaceProvider,
  ) {}

  // === Entity creation ===

  onEntityCreated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil {
    const projectEntity = this.content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (projectEntity) {
      return this.onEntityOverbuilt(projectEntity, entity, stage, byPlayer)
    }
    return this.tryAddNewEntity(entity, stage, byPlayer)
  }

  private onEntityOverbuilt(
    projectEntity: ProjectEntity,
    luaEntity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
  ): UndoAction | nil {
    this.worldPresenter.replaceWorldOrPreviewEntity(projectEntity, stage, luaEntity)
    if (projectEntity.isSettingsRemnant) {
      this.userRevivedSettingsRemnant(projectEntity, stage, byPlayer)
      return nil
    } else if (stage >= projectEntity.firstStage) {
      this.worldPresenter.refreshEntity(projectEntity, stage)
      return nil
    } else {
      return this.onPreviewReplaced(projectEntity, stage, byPlayer)
    }
  }

  private onPreviewReplaced(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil {
    const oldStage = entity.firstStage
    if (this.trySetFirstStage(entity, stage) != StageMoveResult.Updated) {
      this.worldPresenter.rebuildEntity(entity, stage)
      return
    }

    createNotification(
      entity,
      byPlayer,
      [L_Interaction.EntityMovedFromStage, this.settings.getStageName(oldStage)],
      false,
    )
    return byPlayer != nil ? createStageMoveData(this.projectId, entity, oldStage, stage) : nil
  }

  private tryAddNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex | nil,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): UndoAction | nil {
    if (!allowOverlapDifferentDirection.has(entity.type) && entity.supports_direction) {
      const existingDifferentDirection = this.content.findCompatibleEntity(entity.name, entity.position, nil, stage)
      if (existingDifferentDirection) {
        entity.destroy()
        createNotification(existingDifferentDirection, byPlayer, [L_Interaction.CannotBuildDifferentDirection], false)
        return
      }
    }
    this.addNewEntity(entity, stage, stagedInfo, items)
  }

  // After content.addEntity(), treat as ProjectEntity (read-only); all further
  // mutations go through MutableProjectContent to trigger observer notifications.
  addNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    const internalEntity = createNewProjectEntity(entity, stage, stagedInfo, items)
    if (!internalEntity) return nil

    UgActions.fixNewUndergroundBelt(this.content, internalEntity, entity, stage)

    if (internalEntity.getType() == "locomotive") {
      internalEntity.isNewRollingStock = true
    }

    const projectEntity: ProjectEntity = internalEntity
    this.worldPresenter.replaceWorldOrPreviewEntity(projectEntity, stage, entity)
    this.content.addEntity(projectEntity)

    saveWireConnections(
      this.content,
      projectEntity,
      stage,
      projectEntity.lastStageWith(this.settings),
      this.worldPresenter,
    )

    return projectEntity
  }

  // === Entity deletion ===

  onEntityDeleted(entity: LuaEntityInfo, stage: StageNumber): void {
    const projectEntity = this.content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (projectEntity) this.maybeDeleteProjectEntity(projectEntity, stage)
  }

  maybeDeleteProjectEntity(projectEntity: ProjectEntity, stage: number): void {
    const firstStage = projectEntity.firstStage
    if (firstStage != stage) {
      if (firstStage < stage) {
        this.worldPresenter.rebuildEntity(projectEntity, stage)
      }
      return
    }
    this.deleteEntityOrCreateSettingsRemnant(projectEntity)
  }

  deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void {
    if (this.shouldMakeSettingsRemnant(entity)) {
      this.content.makeEntitySettingsRemnant(entity)
    } else {
      this.content.deleteEntity(entity)
    }
  }

  private shouldMakeSettingsRemnant(entity: ProjectEntity): boolean {
    if (entity.hasStageDiff()) return true
    const connections = entity.wireConnections
    if (!connections) return false
    const stage = entity.firstStage
    for (const [otherEntity] of connections) {
      if (this.worldPresenter.getWorldEntity(otherEntity, stage) == nil) {
        return true
      }
    }
    return false
  }

  forceDeleteEntity(entity: ProjectEntity): void {
    this.content.deleteEntity(entity)
  }

  // === Entity updates ===

  onEntityPossiblyUpdated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    if (stagedInfo) {
      return this.handlePasteValue(entity, stage, previousDirection, byPlayer, stagedInfo, items)
    }

    const projectEntity = this.getCompatibleAtCurrentStageOrAdd(
      entity,
      stage,
      previousDirection,
      byPlayer,
      stagedInfo,
      items,
    )
    if (!projectEntity) return

    const result = this.tryUpdateEntityFromWorld(projectEntity, stage, items)
    notifyIfUpdateError(result, projectEntity, byPlayer)
    return projectEntity
  }

  private handlePasteValue(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    stagedInfo: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    const compatible = this.content.findCompatibleWithLuaEntity(entity, previousDirection, stage)
    if (!compatible) {
      this.tryAddNewEntity(entity, stage, byPlayer, stagedInfo, items)
      return nil
    }
    if (compatible.isSettingsRemnant) {
      this.forceDeleteEntity(compatible)
      this.tryAddNewEntity(entity, stage, byPlayer, stagedInfo, items)
      return nil
    }

    this.worldPresenter.replaceWorldOrPreviewEntity(compatible, stage, entity)
    const result = this.setValueFromStagedInfo(compatible, stagedInfo, items, entity)
    notifyIfMoveError(result, compatible, byPlayer)
    return compatible
  }

  private getCompatibleAtCurrentStageOrAdd(
    worldEntity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    const compatible = this.content.findCompatibleWithLuaEntity(worldEntity, previousDirection, stage)

    if (!compatible) {
      this.tryAddNewEntity(worldEntity, stage, byPlayer, stagedInfo, items)
      return nil
    }
    if (stage < compatible.firstStage) {
      this.onEntityOverbuilt(compatible, worldEntity, stage, byPlayer)
      return nil
    }

    this.worldPresenter.replaceWorldOrPreviewEntity(compatible, stage, worldEntity)
    return compatible
  }

  private tryUpdateEntityFromWorld(
    entity: ProjectEntity,
    stage: StageNumber,
    items: BlueprintInsertPlan[] | nil,
  ): EntityUpdateResult {
    const entitySource = this.worldPresenter.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return this.handleUpdate(entity, entitySource, stage, entitySource.direction, nil, true, items)
  }

  private tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = this.worldPresenter.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return this.handleUpdate(entity, entitySource, stage, entitySource.direction, nil, false, nil)
  }

  private tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = this.worldPresenter.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange

    const [upgradeName, upgradeQuality] = entitySource.get_upgrade_target()
    const targetUpgrade = upgradeName && getNameAndQuality(upgradeName.name, upgradeQuality?.name)
    return this.handleUpdate(entity, entitySource, stage, nil, targetUpgrade, false, nil)
  }

  private handleUpdate(
    entity: ProjectEntity,
    entitySource: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: NameAndQuality | nil,
    getBpValue: boolean,
    items: BlueprintInsertPlan[] | nil,
  ): EntityUpdateResult {
    if (entity.isUndergroundBelt()) {
      return UgActions.handleUndergroundBeltUpdate(
        this,
        entity,
        entitySource,
        stage,
        targetDirection,
        targetUpgrade ?? getNameAndQuality(entitySource.name, entitySource.quality.name),
      )
    }

    let result: EntityUpdateResult = EntityUpdateResult.NoChange
    this.content.batch(() => {
      const rotated = targetDirection && targetDirection != entity.direction && !canBeAnyDirection(entitySource)
      if (rotated) {
        const rotateAllowed = stage == entity.firstStage
        if (rotateAllowed) {
          this.content.setEntityDirection(entity, targetDirection)
          const entityType = entitySource.type
          if (entityType == "loader" || entityType == "loader-1x1") {
            assume<LoaderProjectEntity>(entity)
            this.content.setTypeProperty(entity, entitySource.loader_type)
          } else if (entityType == "inserter") {
            assume<InserterProjectEntity>(entity)
            const pickup = entity.firstValue.pickup_position
              ? Pos.minus(entitySource.pickup_position, entitySource.position)
              : nil
            const drop = entity.firstValue.drop_position
              ? Pos.minus(entitySource.drop_position, entitySource.position)
              : nil
            this.content.setInserterPositions(entity, pickup, drop)
          }
        } else {
          this.worldPresenter.refreshEntity(entity, stage)
          result = EntityUpdateResult.CannotRotate
          return
        }
      }
      let hasDiff = false
      if (getBpValue && this.applyValueFromWorld(stage, entity, entitySource, items)) {
        hasDiff = true
      } else if (targetUpgrade) {
        this.checkUpgradeType(entity, targetUpgrade.name)
        if (this.content.applyEntityUpgrade(entity, stage, targetUpgrade)) {
          hasDiff = true
        }
      }
      if (rotated || hasDiff) {
        result = EntityUpdateResult.Updated
        return
      }

      if (entity.getUnstagedValue(stage)?.items) {
        this.worldPresenter.refreshEntity(entity, stage)
      }
    })
    return result
  }

  private applyValueFromWorld(
    stage: StageNumber,
    entity: ProjectEntity,
    entitySource: LuaEntity,
    items: BlueprintInsertPlan[] | nil,
  ): boolean {
    const [value, unstagedValue] = saveEntity(entitySource, items)
    if (value == nil) return false

    const hasDiff = this.content.adjustEntityValue(entity, stage, value)
    const hasUnstagedDiff = this.content.setEntityUnstagedValue(entity, stage, unstagedValue)
    return hasDiff || hasUnstagedDiff
  }

  private checkUpgradeType(existing: ProjectEntity, upgradeType: string): void {
    if (!areUpgradeableTypes(existing.firstValue.name, upgradeType))
      error(` incompatible upgrade from ${existing.firstValue.name} to ${upgradeType}`)
  }

  // === Underground belt handling ===

  // === Rotation ===

  onEntityRotated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void {
    const projectEntity = this.getCompatibleAtCurrentStageOrAdd(entity, stage, previousDirection, byPlayer)
    if (projectEntity) {
      this.handleRotate(projectEntity, stage, byPlayer)
    }
  }

  private handleRotate(projectEntity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const result = this.tryRotateEntityFromWorld(projectEntity, stage)
    notifyIfUpdateError(result, projectEntity, byPlayer)

    if (projectEntity.isUndergroundBelt()) {
      const freshWorldEntity = this.worldPresenter.getWorldEntity(projectEntity, stage)
      if (!freshWorldEntity) return
      const worldPair = freshWorldEntity.neighbours as LuaEntity | nil
      if (!worldPair) return
      const pairEntity = this.getCompatibleAtCurrentStageOrAdd(worldPair, stage, nil, byPlayer)
      if (!pairEntity) return
      const expectedPair = findUndergroundPair(this.content, projectEntity, stage)
      if (pairEntity != expectedPair) {
        this.worldPresenter.refreshEntity(pairEntity, stage)
      }
    }
  }

  onUndergroundBeltDragRotated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
    const projectEntity = this.content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (!projectEntity || !projectEntity.isUndergroundBelt()) return
    if (!entity.rotate()) return
    this.handleRotate(projectEntity, stage, byPlayer)
  }

  // === Wires ===

  onWiresPossiblyUpdated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const projectEntity = this.getCompatibleAtCurrentStageOrAdd(entity, stage, nil, byPlayer)
    if (!projectEntity) return
    const result = this.updateWiresFromWorld(projectEntity, stage)
    if (result != "updated" && result != "no-change") {
      assertNever(result)
    }
  }

  private updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult {
    const connectionsChanged = saveWireConnections(this.content, entity, stage, stage, this.worldPresenter)
    if (!connectionsChanged) return WireUpdateResult.NoChange
    return WireUpdateResult.Updated
  }

  // === Upgrade ===

  onEntityMarkedForUpgrade(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const projectEntity = this.getCompatibleAtCurrentStageOrAdd(entity, stage, nil, byPlayer)
    if (!projectEntity) return

    const result = this.tryUpgradeEntityFromWorld(projectEntity, stage)
    notifyIfUpdateError(result, projectEntity, byPlayer)
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  // === Tools ===

  onCleanupToolUsed(entity: LuaEntity, stage: StageNumber): void {
    this.onTryFixEntity(entity, stage, true)
  }

  onExcludeFromBlueprintsUsed(entity: LuaEntity, stage: StageNumber, excluded: boolean): void {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity) return
    this.content.setEntityExcludedFromBlueprints(projectEntity, stage, excluded)
  }

  onTryFixEntity(previewEntity: LuaEntity, stage: StageNumber, deleteSettingsRemnants?: boolean): void {
    const existing = this.content.findCompatibleFromPreviewOrLuaEntity(previewEntity, stage)
    if (!existing) return
    if (existing.isSettingsRemnant) {
      if (deleteSettingsRemnants) {
        this.forceDeleteEntity(existing)
      }
    } else if (this.worldPresenter.hasErrorAt(existing, stage)) {
      this.worldPresenter.refreshAllEntities(existing)
    }
  }

  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void {
    const existing = this.content.findCompatibleFromPreviewOrLuaEntity(previewEntity, stage)
    if (!existing || existing.isSettingsRemnant) return
    this.worldPresenter.refreshEntity(existing, stage)
  }

  onEntityForceDeleteUsed(entity: LuaEntity, stage: StageNumber, _byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity) return nil
    const undoData = createDeleteEntityUndoData(projectEntity, this.projectId)
    this.forceDeleteEntity(projectEntity)
    return tagUndoDeleteEntity.createAction(undoData)
  }

  onEntityDied(entity: LuaEntityInfo, stage: StageNumber): void {
    const projectEntity = this.content.findCompatibleWithLuaEntity(entity, nil, stage)
    if (projectEntity) {
      this.worldPresenter.deleteEntityAtStage(projectEntity, stage)
    }
  }

  // === Stage move / settings remnant ===

  tryReviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    if (!entity.isSettingsRemnant) return StageMoveResult.NoChange
    if (entity.isPersistent()) return StageMoveResult.EntityIsPersistent
    const result = this.checkCanSetFirstStage(entity, stage)
    if (result == StageMoveResult.Updated || result == StageMoveResult.NoChange) {
      this.content.reviveEntity(entity, stage)
    }
    return result
  }

  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    const result = this.checkCanSetFirstStage(entity, stage)
    if (result == StageMoveResult.Updated) {
      this.content.setEntityFirstStage(entity, stage)
    }
    return result
  }

  trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    const result = this.checkCanSetLastStage(entity, stage)
    if (result == StageMoveResult.Updated) {
      this.content.setEntityLastStage(entity, stage)
    }
    return result
  }

  private checkCanSetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    if (entity.isPersistent() && stage != 1) return StageMoveResult.EntityIsPersistent
    if (entity.isSettingsRemnant || entity.firstStage == stage) return StageMoveResult.NoChange
    if (entity.isMovable()) return StageMoveResult.Updated
    if (entity.lastStage && stage > entity.lastStage) return StageMoveResult.CannotMovePastLastStage

    if (!this.firstStageChangeWillIntersect(entity, stage)) {
      return StageMoveResult.IntersectsAnotherEntity
    }
    return StageMoveResult.Updated
  }

  private checkCanSetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    if (entity.isPersistent()) return StageMoveResult.EntityIsPersistent
    if (entity.isSettingsRemnant || entity.isMovable()) return StageMoveResult.NoChange
    const oldLastStage = entity.lastStage
    if (oldLastStage == stage) return StageMoveResult.NoChange
    if (stage != nil && stage < entity.firstStage) return StageMoveResult.CannotMoveBeforeFirstStage

    if (!this.lastStageChangeWillIntersect(entity, stage)) {
      return StageMoveResult.IntersectsAnotherEntity
    }

    return StageMoveResult.Updated
  }

  private firstStageChangeWillIntersect(entity: ProjectEntity, newStage: StageNumber): boolean {
    if (newStage >= entity.firstStage) return true
    const foundBelow = this.content.findCompatibleWithExistingEntity(entity, newStage)
    return foundBelow == nil || foundBelow == entity
  }

  private lastStageChangeWillIntersect(entity: ProjectEntity, newStage: StageNumber | nil): boolean {
    const { lastStage } = entity
    if (lastStage == nil || (newStage != nil && newStage < lastStage)) return true
    const foundAbove = this.content.findCompatibleWithExistingEntity(entity, lastStage + 1)
    return foundAbove == nil || (newStage != nil && foundAbove.firstStage > newStage)
  }

  // === Staged info / value ===

  private setValueFromStagedInfo(
    entity: ProjectEntity,
    info: StageInfoExport,
    items: BlueprintInsertPlan[] | nil,
    luaEntity: LuaEntity,
  ): StageMoveResult {
    const firstValue = info.firstValue ?? saveEntity(luaEntity, items ?? [])[0]
    if (!firstValue) return StageMoveResult.NoChange
    let moveResult: StageMoveResult = StageMoveResult.Updated
    this.content.batch(() => {
      const targetStage = info.firstStage
      if (targetStage != entity.firstStage) {
        const result = this.checkCanSetFirstStage(entity, targetStage)
        if (result != StageMoveResult.Updated) {
          moveResult = result
          return
        }
        this.content.setEntityFirstStage(entity, targetStage)
      }
      const lastStage = info.lastStage
      const oldLastStage = entity.lastStage
      if (lastStage != oldLastStage) {
        const result = this.checkCanSetLastStage(entity, lastStage)
        if (result != StageMoveResult.Updated) {
          moveResult = result
          return
        }
        this.content.setEntityLastStage(entity, lastStage)
      }

      const oldStageDiffs = entity.stageDiffs

      const stageDiffs = info.stageDiffs ? fromExportStageDiffs(info.stageDiffs) : nil
      this.content.setEntityValue(entity, firstValue, stageDiffs)
      this.replaceStagePropertiesViaContent(entity, info)

      if (entity.isUndergroundBelt()) {
        UgActions.handleUndergroundBeltValueSet(this, entity, oldStageDiffs, stageDiffs)
      }
    })
    return moveResult
  }

  private replaceStagePropertiesViaContent(entity: ProjectEntity<Entity>, info: StageInfoExport<Entity>): void {
    const props = info.stageProperties ?? legacyToStageProperties(info)
    this.content.replaceEntityStageProperties(entity, props ? parseStagePropertiesExport(props) : nil)
  }

  // === Props ===

  resetProp<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean {
    return this.content.resetEntityProp(entity, stage, prop)
  }

  movePropDown<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean {
    return this.content.moveEntityPropDown(entity, stage, prop) != nil
  }

  resetAllProps(entity: ProjectEntity, stage: StageNumber): boolean {
    return this.content.resetEntityValue(entity, stage)
  }

  moveAllPropsDown(entity: ProjectEntity, stage: StageNumber): boolean {
    return this.content.moveEntityValueDown(entity, stage) != nil
  }

  // === Vehicles ===

  resetVehicleLocation(entity: MovableProjectEntity): void {
    const stage = entity.firstStage
    const luaEntity = this.worldPresenter.getWorldEntity(entity, stage)
    if (!luaEntity) {
      this.worldPresenter.refreshEntity(entity, stage)
      return
    }

    const train = luaEntity.train
    if (train) {
      const projectEntities = train.carriages.map((e) => this.content.findCompatibleWithLuaEntity(e, nil, stage)!)
      this.worldPresenter.rebuildAllEntitiesTogether(projectEntities)
    } else {
      this.worldPresenter.rebuildEntity(entity, stage)
    }
  }

  setVehicleLocationHere(entity: MovableProjectEntity): void {
    const stage = entity.firstStage
    const luaEntity = this.worldPresenter.getWorldEntity(entity, stage)
    if (!luaEntity) return

    const train = luaEntity.train
    if (train) {
      this.setTrainLocationHere(train, stage)
    } else {
      this.content.changeEntityPosition(entity, luaEntity.position)
    }
  }

  private setTrainLocationHere(train: LuaTrain, stage: StageNumber): void {
    const entities = train.carriages

    for (const luaEntity of entities) {
      const projectEntity = this.content.findCompatibleWithLuaEntity(luaEntity, nil, stage)
      if (projectEntity) {
        this.content.batch(() => {
          this.content.changeEntityPosition(projectEntity, luaEntity.position)
          assume<ProjectEntity<TrainEntity>>(projectEntity)
          this.content.setEntityProp(projectEntity, projectEntity.firstStage, "orientation", luaEntity.orientation)
        })
      } else {
        this.addNewEntity(luaEntity, stage)
      }
    }
  }

  // === Tiles ===

  setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void {
    TileActions.setTileAtStage(this, position, stage, value)
  }

  deleteTile(position: Position): boolean {
    return TileActions.deleteTile(this, position)
  }

  scanProjectForExistingTiles(): void {
    TileActions.scanProjectForExistingTiles(this)
  }

  onTileBuilt(position: Position, name: string, stage: StageNumber): void {
    TileActions.onTileBuilt(this, position, name, stage)
  }

  onTileMined(position: Position, stage: StageNumber): void {
    TileActions.onTileMined(this, position, stage)
  }

  // === Selection tools ===

  onStageDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this.handleStageDelete(entity, stage, byPlayer, false)
  }

  onStageDeleteReverseUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this.handleStageDelete(entity, stage, byPlayer, true)
  }

  private handleStageDelete(
    entity: LuaEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
    isReverse: boolean,
  ): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    const player = game.get_player(byPlayer)
    const useNextStage = !!player?.mod_settings[Settings.DeleteAtNextStage]?.value != isReverse
    const newLastStage = useNextStage ? stage : stage - 1
    const oldLastStage = projectEntity.lastStage
    if (this.userTrySetLastStage(projectEntity, newLastStage, byPlayer)) {
      return createLastStageChangeData(this.projectId, projectEntity, oldLastStage, newLastStage)
    }
  }

  onStageDeleteCancelUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant || projectEntity.lastStage != stage) return
    return this.userTrySetLastStageWithUndo(projectEntity, nil, byPlayer)
  }

  onBringToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    const oldStage = projectEntity.firstStage
    if (this.userBringEntityToStage(projectEntity, stage, byPlayer)) {
      return createBringToStageData(this.projectId, projectEntity, oldStage, stage)
    }
  }

  onBringDownToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    if (projectEntity.firstStage <= stage) return
    const oldStage = projectEntity.firstStage
    if (this.userBringEntityToStage(projectEntity, stage, byPlayer)) {
      return createBringToStageData(this.projectId, projectEntity, oldStage, stage)
    }
  }

  onSendToStageUsed(
    entity: LuaEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    onlyIfMatchesFirstStage: boolean,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    if (fromStage == toStage) return
    const projectEntity = this.content.findEntityExact(entity, entity.position, fromStage, this.worldPresenter)
    if (
      !projectEntity ||
      projectEntity.isSettingsRemnant ||
      (onlyIfMatchesFirstStage && projectEntity.firstStage != fromStage)
    )
      return

    if (this.userSendEntityToStage(projectEntity, fromStage, toStage, byPlayer)) {
      return createSendToStageData(this.projectId, projectEntity, fromStage, toStage)
    }
  }

  onMoveEntityToStageCustomInput(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    return this.userTryMoveEntityToStageWithUndo(projectEntity, stage, byPlayer)
  }

  rebuildEntity(worldEntity: LuaEntity, stageNumber: StageNumber): void {
    const projectEntity = this.getCompatibleAtCurrentStageOrAdd(worldEntity, stageNumber, nil, nil)
    if (projectEntity) {
      this.worldPresenter.replaceWorldOrPreviewEntity(projectEntity, stageNumber, worldEntity)
      this.worldPresenter.rebuildEntity(projectEntity, stageNumber)
    }
  }

  resyncWithWorld(): void {
    submitTask(new ResyncWithWorldTask(this))
  }

  // === Surface ===

  onSurfaceCleared(stage: StageNumber): void {
    const area = this.content.computeBoundingBox()
    for (const entity of this.content.allEntities()) {
      this.worldPresenter.deleteEntityAtStage(entity, stage)
    }
    if (area) prepareArea(this.surfaces.getSurface(stage)!, area)
  }

  // === User stage actions ===

  findCompatibleEntityForUndo(entity: ProjectEntity): ProjectEntity | nil {
    if (!this.valid) return nil
    if (!this.content.hasEntity(entity)) {
      const matching = this.content.findCompatibleWithExistingEntity(entity, entity.firstStage)
      if (!matching || entity.firstStage != matching.firstStage || !deepCompare(entity.firstValue, matching.firstValue))
        return nil
      return matching
    }
    return entity
  }

  userRevivedSettingsRemnant(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const result = this.tryReviveSettingsRemnant(entity, stage)
    if (result != "updated" && result != "no-change") {
      notifyIfMoveError(result, entity, byPlayer)
      this.worldPresenter.refreshEntity(entity, stage)
    }
  }

  userMoveEntityToStageWithUndo(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
    const undoAction = this.userTryMoveEntityToStageWithUndo(entity, stage, byPlayer)
    if (!undoAction) return
    const player = game.get_player(byPlayer)
    if (player) pushUndo(player, player.surface, undoAction)
  }

  userSetLastStageWithUndo(projectEntity: ProjectEntity, newLastStage: StageNumber | nil, byPlayer: PlayerIndex): void {
    const undoAction = this.userTrySetLastStageWithUndo(projectEntity, newLastStage, byPlayer)
    if (!undoAction) return
    const player = game.get_player(byPlayer)
    if (player) pushUndo(player, player.surface, undoAction)
  }

  userBringEntityToStage(projectEntity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): boolean {
    const oldStage = projectEntity.firstStage
    if (oldStage == stage) return false
    const result = this.trySetFirstStage(projectEntity, stage)
    if (result != "updated") {
      notifyIfMoveError(result, projectEntity, byPlayer)
      return false
    }
    if (oldStage < stage) createIndicator(projectEntity, byPlayer, ">>", Colors.Blueish)
    return true
  }

  userSendEntityToStage(
    projectEntity: ProjectEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    byPlayer: PlayerIndex,
  ): boolean {
    const result = this.trySetFirstStage(projectEntity, toStage)
    if (result != "updated") {
      notifyIfMoveError(result, projectEntity, byPlayer)
      return false
    }
    if (toStage < fromStage) createIndicator(projectEntity, byPlayer, "<<", Colors.Orange)
    return true
  }

  userTryMoveEntityToStage(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
    returned?: boolean,
  ): boolean {
    const oldStage = entity.firstStage
    const result = this.trySetFirstStage(entity, stage)
    if (result == "updated") {
      if (returned) {
        createNotification(
          entity,
          byPlayer,
          [L_Interaction.EntityMovedBackToStage, this.settings.getStageName(stage)],
          false,
        )
      } else {
        createNotification(
          entity,
          byPlayer,
          [L_Interaction.EntityMovedFromStage, this.settings.getStageName(oldStage)],
          false,
        )
      }
      return true
    }

    if (result == "no-change") {
      createNotification(entity, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
    } else {
      notifyIfMoveError(result, entity, byPlayer)
    }
    return false
  }

  userTrySetLastStage(
    projectEntity: ProjectEntity,
    newLastStage: StageNumber | nil,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const result = this.trySetLastStage(projectEntity, newLastStage)
    notifyIfMoveError(result, projectEntity, byPlayer)
    return result == StageMoveResult.Updated
  }

  private userTryMoveEntityToStageWithUndo(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const oldStage = entity.firstStage
    if (this.userTryMoveEntityToStage(entity, stage, byPlayer)) {
      return createStageMoveData(this.projectId, entity, oldStage, stage)
    }
  }

  private userTrySetLastStageWithUndo(
    projectEntity: ProjectEntity,
    stage: StageNumber | nil,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const oldLastStage = projectEntity.lastStage
    if (this.userTrySetLastStage(projectEntity, stage, byPlayer)) {
      return createLastStageChangeData(this.projectId, projectEntity, oldLastStage, stage)
    }
  }
}

@RegisterClass("ResyncWithWorldTask")
class ResyncWithWorldTask extends LoopTask {
  constructor(private actions: ProjectActions) {
    super(actions.settings.stageCount() * 2)
  }

  override getTitle(): LocalisedString {
    return [L_GuiTasks.ResyncWithWorld]
  }

  protected override doStep(i: number): void {
    const numStages = this.actions.settings.stageCount()
    if (i < numStages) {
      this.doReadStep(i + 1)
    } else {
      const rebuildStage = i - numStages + 1
      if (rebuildStage == 1) _setWorldUpdatesBlocked(false)
      this.actions.worldPresenter.rebuildStage(rebuildStage)
    }
  }

  private doReadStep(stage: StageNumber): void {
    if (stage == 1) _setWorldUpdatesBlocked(true)
    const surface = this.actions.surfaces.getSurface(stage)
    if (!surface) return
    for (const entity of surface.find_entities()) {
      if (isWorldEntityProjectEntity(entity)) {
        this.actions.onEntityPossiblyUpdated(entity, stage, nil, nil)
      }
    }
  }

  protected getTitleForStep(step: number): LocalisedString {
    const numStages = this.actions.settings.stageCount()
    if (step < numStages) {
      return [L_GuiTasks.ReadingStage, this.actions.settings.getStageName(step + 1)]
    }
    return [L_GuiTasks.RebuildingStage, this.actions.settings.getStageName(step - numStages + 1)]
  }

  override cancel(): void {
    _setWorldUpdatesBlocked(false)
  }
}

function createNewProjectEntity(
  entity: LuaEntity,
  stage: StageNumber,
  stageInfo: StageInfoExport | nil,
  items?: BlueprintInsertPlan[],
): InternalProjectEntity | nil {
  if (stageInfo) {
    return createProjectEntityFromStagedInfo(entity, stageInfo, items)
  }
  const [value, unstagedValue] = saveEntity(entity, items)
  if (!value) return nil
  return newProjectEntity(value, entity.position, entity.direction, stage, unstagedValue)
}

function createProjectEntityFromStagedInfo(
  entity: LuaEntity,
  stageInfo: StageInfoExport,
  items: BlueprintInsertPlan[] | nil,
): InternalProjectEntity | nil {
  const [value, unstagedValue] = saveEntity(entity, items)
  if (!value) return nil

  const projectEntity = newProjectEntity(
    stageInfo.firstValue ?? value,
    entity.position,
    entity.direction,
    stageInfo.firstStage,
    unstagedValue,
  )
  projectEntity.setLastStage(stageInfo.lastStage)
  const diffs = stageInfo.stageDiffs
  if (diffs) {
    projectEntity.setStageDiffsDirectly(fromExportStageDiffs(diffs))
  }
  replaceStagePropertiesDirect(projectEntity, stageInfo)
  return projectEntity
}

function replaceStagePropertiesDirect(entity: InternalProjectEntity, info: StageInfoExport<Entity>): void {
  const props = info.stageProperties ?? legacyToStageProperties(info)
  entity.setStagePropertiesDirectly(props ? parseStagePropertiesExport(props) : nil)
}

function legacyToStageProperties(info: StageInfoExport): StagePropertiesExport | nil {
  if (!info.unstagedValue) return nil
  return { unstagedValue: info.unstagedValue as StagePropertiesExport["unstagedValue"] }
}

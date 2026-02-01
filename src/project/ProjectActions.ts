import { BlueprintInsertPlan, LuaEntity, nil, PlayerIndex } from "factorio:runtime"
import { Entity, LuaEntityInfo } from "../entity/Entity"
import { MutableProjectContent } from "../entity/ProjectContent"
import { MovableProjectEntity, ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { StageInfoExport } from "../import-export/entity"
import { RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { ProjectBase } from "./Project"
import { EntityUpdateResult, ProjectUpdates, StageMoveResult, WireUpdateResult } from "./project-updates"
import { ProjectSettings } from "./ProjectSettings"
import { UndoAction } from "./undo"
import { InternalUserActions, UserActions } from "./user-actions"
import { WorldPresentation, WorldPresenter } from "./WorldPresentation"

@RegisterClass("ProjectActions")
export class ProjectActions {
  private _projectUpdates!: ProjectUpdates
  private _userActions!: InternalUserActions

  constructor(
    project: ProjectBase,
    readonly content: MutableProjectContent,
    readonly worldPresenter: WorldPresenter,
    readonly settings: ProjectSettings,
  ) {
    const wp = worldPresenter as WorldPresentation
    const worldUpdates = wp.getWorldUpdates()
    this._projectUpdates = ProjectUpdates(project, worldUpdates)
    this._userActions = UserActions(project, this._projectUpdates, worldUpdates) as InternalUserActions
  }

  // UserActions event-handling methods
  onEntityCreated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): UndoAction | nil {
    return this._userActions.onEntityCreated(entity, stage, byPlayer)
  }

  onEntityDeleted(entity: LuaEntityInfo, stage: StageNumber): void {
    this._userActions.onEntityDeleted(entity, stage)
  }

  onEntityPossiblyUpdated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction | nil,
    byPlayer: PlayerIndex | nil,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    return this._userActions.onEntityPossiblyUpdated(entity, stage, previousDirection, byPlayer, stagedInfo, items)
  }

  onEntityRotated(
    entity: LuaEntity,
    stage: StageNumber,
    previousDirection: defines.direction,
    byPlayer: PlayerIndex | nil,
  ): void {
    this._userActions.onEntityRotated(entity, stage, previousDirection, byPlayer)
  }

  onUndergroundBeltDragRotated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
    this._userActions.onUndergroundBeltDragRotated(entity, stage, byPlayer)
  }

  onWiresPossiblyUpdated(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    this._userActions.onWiresPossiblyUpdated(entity, stage, byPlayer)
  }

  onEntityMarkedForUpgrade(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    this._userActions.onEntityMarkedForUpgrade(entity, stage, byPlayer)
  }

  // Tool handler methods
  onCleanupToolUsed(entity: LuaEntity, stage: StageNumber): void {
    this._userActions.onCleanupToolUsed(entity, stage)
  }

  onTryFixEntity(previewEntity: LuaEntity, stage: StageNumber, deleteSettingsRemnants?: boolean): void {
    this._userActions.onTryFixEntity(previewEntity, stage, deleteSettingsRemnants)
  }

  onChunkGeneratedForEntity(previewEntity: LuaEntity, stage: StageNumber): void {
    this._userActions.onChunkGeneratedForEntity(previewEntity, stage)
  }

  onEntityForceDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onEntityForceDeleteUsed(entity, stage, byPlayer)
  }

  onEntityDied(entity: LuaEntityInfo, stage: StageNumber): void {
    this._userActions.onEntityDied(entity, stage)
  }

  // Selection tool methods
  onStageDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onStageDeleteUsed(entity, stage, byPlayer)
  }

  onStageDeleteReverseUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onStageDeleteReverseUsed(entity, stage, byPlayer)
  }

  onStageDeleteCancelUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onStageDeleteCancelUsed(entity, stage, byPlayer)
  }

  onBringToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onBringToStageUsed(entity, stage, byPlayer)
  }

  onBringDownToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onBringDownToStageUsed(entity, stage, byPlayer)
  }

  onSendToStageUsed(
    entity: LuaEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    onlyIfMatchesFirstStage: boolean,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    return this._userActions.onSendToStageUsed(entity, fromStage, toStage, onlyIfMatchesFirstStage, byPlayer)
  }

  onMoveEntityToStageCustomInput(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    return this._userActions.onMoveEntityToStageCustomInput(entity, stage, byPlayer)
  }

  rebuildEntity(entity: LuaEntity, stageNumber: StageNumber): void {
    this._userActions.rebuildEntity(entity, stageNumber)
  }

  onSurfaceCleared(stage: StageNumber): void {
    this._userActions.onSurfaceCleared(stage)
  }

  // Programmatic UI methods
  userRevivedSettingsRemnant(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    this._userActions.userRevivedSettingsRemnant(entity, stage, byPlayer)
  }

  userMoveEntityToStageWithUndo(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
    this._userActions.userMoveEntityToStageWithUndo(entity, stage, byPlayer)
  }

  userSetLastStageWithUndo(projectEntity: ProjectEntity, newLastStage: StageNumber | nil, byPlayer: PlayerIndex): void {
    this._userActions.userSetLastStageWithUndo(projectEntity, newLastStage, byPlayer)
  }

  userBringEntityToStage(projectEntity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): boolean {
    return this._userActions.userBringEntityToStage(projectEntity, stage, byPlayer)
  }

  userSendEntityToStage(
    projectEntity: ProjectEntity,
    fromStage: StageNumber,
    toStage: StageNumber,
    byPlayer: PlayerIndex,
  ): boolean {
    return this._userActions.userSendEntityToStage(projectEntity, fromStage, toStage, byPlayer)
  }

  // Tile event methods
  onTileBuilt(position: Position, value: string, stage: StageNumber): void {
    this._userActions.onTileBuilt(position, value, stage)
  }

  onTileMined(position: Position, stage: StageNumber): void {
    this._userActions.onTileMined(position, stage)
  }

  // ProjectUpdates methods exposed on ProjectActions
  addNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    return this._projectUpdates.addNewEntity(entity, stage, stagedInfo, items)
  }

  maybeDeleteProjectEntity(entity: ProjectEntity, stage: StageNumber): void {
    this._projectUpdates.maybeDeleteProjectEntity(entity, stage)
  }

  deleteEntityOrCreateSettingsRemnant(entity: ProjectEntity): void {
    this._projectUpdates.deleteEntityOrCreateSettingsRemnant(entity)
  }

  forceDeleteEntity(entity: ProjectEntity): void {
    this._projectUpdates.forceDeleteEntity(entity)
  }

  readdDeletedEntity(entity: ProjectEntity): void {
    this._projectUpdates.readdDeletedEntity(entity)
  }

  tryReviveSettingsRemnant(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    return this._projectUpdates.tryReviveSettingsRemnant(entity, stage)
  }

  tryUpdateEntityFromWorld(
    entity: ProjectEntity,
    stage: StageNumber,
    items?: BlueprintInsertPlan[],
  ): EntityUpdateResult {
    return this._projectUpdates.tryUpdateEntityFromWorld(entity, stage, items)
  }

  tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    return this._projectUpdates.tryRotateEntityFromWorld(entity, stage)
  }

  tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    return this._projectUpdates.tryUpgradeEntityFromWorld(entity, stage)
  }

  updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult {
    return this._projectUpdates.updateWiresFromWorld(entity, stage)
  }

  setValueFromStagedInfo(
    entity: ProjectEntity,
    info: StageInfoExport,
    items: BlueprintInsertPlan[] | nil,
    luaEntity: LuaEntity,
  ): StageMoveResult {
    return this._projectUpdates.setValueFromStagedInfo(entity, info, items, luaEntity)
  }

  trySetFirstStage(entity: ProjectEntity, stage: StageNumber): StageMoveResult {
    return this._projectUpdates.trySetFirstStage(entity, stage)
  }

  trySetLastStage(entity: ProjectEntity, stage: StageNumber | nil): StageMoveResult {
    return this._projectUpdates.trySetLastStage(entity, stage)
  }

  resetProp<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean {
    return this._projectUpdates.resetProp(entity, stage, prop)
  }

  movePropDown<T extends Entity>(entity: ProjectEntity<T>, stage: StageNumber, prop: keyof T): boolean {
    return this._projectUpdates.movePropDown(entity, stage, prop)
  }

  resetAllProps(entity: ProjectEntity, stage: StageNumber): boolean {
    return this._projectUpdates.resetAllProps(entity, stage)
  }

  moveAllPropsDown(entity: ProjectEntity, stage: StageNumber): boolean {
    return this._projectUpdates.moveAllPropsDown(entity, stage)
  }

  resetVehicleLocation(entity: MovableProjectEntity): void {
    this._projectUpdates.resetVehicleLocation(entity)
  }

  setVehicleLocationHere(entity: MovableProjectEntity): void {
    this._projectUpdates.setVehicleLocationHere(entity)
  }

  setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void {
    this._projectUpdates.setTileAtStage(position, stage, value)
  }

  deleteTile(position: Position): boolean {
    return this._projectUpdates.deleteTile(position)
  }

  scanProjectForExistingTiles(): void {
    this._projectUpdates.scanProjectForExistingTiles()
  }

  // Internal methods for undo handlers
  findCompatibleEntityForUndo(entity: ProjectEntity): ProjectEntity | nil {
    return this._userActions.findCompatibleEntityForUndo(entity)
  }

  userTryMoveEntityToStage(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
    returned?: boolean,
  ): boolean {
    return this._userActions.userTryMoveEntityToStage(entity, stage, byPlayer, returned)
  }

  userTrySetLastStage(
    projectEntity: ProjectEntity,
    newLastStage: StageNumber | nil,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    return this._userActions.userTrySetLastStage(projectEntity, newLastStage, byPlayer)
  }
}

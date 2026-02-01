import { BlueprintInsertPlan, LuaEntity, LuaTrain, nil, PlayerIndex } from "factorio:runtime"
import { Colors, L_Game, Settings } from "../constants"
import { Entity, LuaEntityInfo, TrainEntity } from "../entity/Entity"
import { MutableProjectContent } from "../entity/ProjectContent"
import {
  getNameAndQuality,
  InserterProjectEntity,
  LoaderProjectEntity,
  MovableProjectEntity,
  NameAndQuality,
  newProjectEntity,
  ProjectEntity,
  StageDiffs,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../entity/ProjectEntity"
import { allowOverlapDifferentDirection, areUpgradeableTypes, getPrototypeInfo } from "../entity/prototype-info"
import { canBeAnyDirection, forceFlipUnderground, saveEntity } from "../entity/save-load"
import { findUndergroundPair, undergroundCanReach } from "../entity/underground-belt"
import { saveWireConnections } from "../entity/wires"
import { fromExportStageDiffs, StageInfoExport } from "../import-export/entity"
import { assertNever, deepCompare, RegisterClass } from "../lib"
import { Pos, Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { createProjectTile, ProjectTile } from "../tiles/ProjectTile"
import { createIndicator, createNotification } from "./notifications"
import { Project, ProjectBase } from "./Project"
import { ProjectSettings } from "./ProjectSettings"
import { prepareArea } from "./surfaces"
import { registerUndoAction, UndoAction, UndoHandler } from "./undo"
import { WorldPresenter } from "./WorldPresentation"

export declare const enum EntityUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotRotate = "cannot-rotate",
  CannotUpgradeChangedPair = "cannot-upgrade-changed-pair",
}

export declare const enum WireUpdateResult {
  Updated = "updated",
  NoChange = "no-change",
}

export declare const enum StageMoveResult {
  Updated = "updated",
  NoChange = "no-change",
  CannotMovePastLastStage = "cannot-move-past-last-stage",
  CannotMoveBeforeFirstStage = "cannot-move-before-first-stage",
  IntersectsAnotherEntity = "intersects-another-entity",
  EntityIsPersistent = "entity-is-persistent",
}

interface ProjectEntityRecord {
  project: ProjectBase
  entity: ProjectEntity
}

interface StageChangeRecord extends ProjectEntityRecord {
  oldStage: StageNumber
}

interface LastStageChangeRecord extends ProjectEntityRecord {
  oldLastStage: StageNumber | nil
}

interface InternalProject extends Project {
  actions: ProjectActions
}

export const undoDeleteEntity = UndoHandler<ProjectEntityRecord>("delete entity", (_, { project, entity }) => {
  const actions = (project as InternalProject).actions
  actions.readdDeletedEntity(entity)
})

export const undoManualStageMove = UndoHandler<StageChangeRecord>(
  "stage move",
  (player, { project, entity, oldStage }) => {
    const actions = (project as InternalProject).actions
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userTryMoveEntityToStage(actualEntity, oldStage, player.index, true)
    }
  },
)

export const undoSendToStage = UndoHandler<StageChangeRecord>(
  "send to stage",
  (player, { project, entity, oldStage }) => {
    const actions = (project as InternalProject).actions
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userBringEntityToStage(actualEntity, oldStage, player.index)
    }
  },
)

export const undoBringToStage = UndoHandler<StageChangeRecord>(
  "bring to stage",
  (player, { project, entity, oldStage }) => {
    const actions = (project as InternalProject).actions
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userSendEntityToStage(actualEntity, actualEntity.firstStage, oldStage, player.index)
    }
  },
)

export const lastStageChangeUndo = UndoHandler(
  "last stage change",
  (player, { project, entity, oldLastStage }: LastStageChangeRecord) => {
    const actions = (project as InternalProject).actions
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userTrySetLastStage(actualEntity, oldLastStage, player.index)
    }
  },
)

@RegisterClass("ProjectActions")
export class ProjectActions {
  private readonly blueprintableTiles: ReadonlyLuaSet<string>

  constructor(
    private readonly project: ProjectBase,
    readonly content: MutableProjectContent,
    readonly worldPresenter: WorldPresenter,
    readonly settings: ProjectSettings,
  ) {
    this.blueprintableTiles = getPrototypeInfo().blueprintableTiles
  }

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
      [L_Interaction.EntityMovedFromStage, this.project.settings.getStageName(oldStage)],
      false,
    )
    return byPlayer && undoManualStageMove.createAction(byPlayer, { project: this.project, entity, oldStage })
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

  addNewEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stagedInfo?: StageInfoExport,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    const projectEntity = this.createNewProjectEntity(entity, stage, stagedInfo, items)
    if (!projectEntity) return nil

    this.fixNewUndergroundBelt(projectEntity, entity, stage)

    if (projectEntity.getType() == "locomotive") {
      projectEntity._asMut().isNewRollingStock = true
    }

    this.worldPresenter.replaceWorldOrPreviewEntity(projectEntity, stage, entity)
    this.content.addEntity(projectEntity)

    saveWireConnections(
      this.content,
      projectEntity,
      stage,
      this.project.lastStageFor(projectEntity),
      this.worldPresenter,
    )

    return projectEntity
  }

  private createNewProjectEntity(
    entity: LuaEntity,
    stage: StageNumber,
    stageInfo: StageInfoExport | nil,
    items?: BlueprintInsertPlan[],
  ): ProjectEntity | nil {
    if (stageInfo) {
      return this.createProjectEntityFromStagedInfo(entity, stageInfo, items)
    }
    const [value, unstagedValue] = saveEntity(entity, items)
    if (!value) return nil
    return newProjectEntity(value, entity.position, entity.direction, stage, unstagedValue)
  }

  private createProjectEntityFromStagedInfo(
    entity: LuaEntity,
    stageInfo: StageInfoExport,
    items: BlueprintInsertPlan[] | nil,
  ): ProjectEntity | nil {
    const [value, unstagedValue] = saveEntity(entity, items)
    if (!value) return nil

    const projectEntity = newProjectEntity(
      stageInfo.firstValue ?? value,
      entity.position,
      entity.direction,
      stageInfo.firstStage,
      unstagedValue,
    )
    projectEntity.setLastStageUnchecked(stageInfo.lastStage)
    const diffs = stageInfo.stageDiffs
    if (diffs) {
      projectEntity.setStageDiffsDirectly(fromExportStageDiffs(diffs))
    }
    this.replaceUnstagedValueDirect(projectEntity, stageInfo)
    return projectEntity
  }

  private fixNewUndergroundBelt(projectEntity: ProjectEntity, entity: LuaEntity, stage: StageNumber): void {
    if (entity.type != "underground-belt") return
    assume<UndergroundBeltProjectEntity>(projectEntity)
    const pair = findUndergroundPair(this.content, projectEntity, stage)
    if (pair) {
      const expectedType = pair.firstValue.type == "output" ? "input" : "output"
      if (expectedType != projectEntity.firstValue.type) {
        const mut = projectEntity._asMut()
        mut.setTypeProperty(expectedType)
        mut.direction = pair.direction
      }
    }
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

  readdDeletedEntity(entity: ProjectEntity): void {
    this.content.addEntity(entity)
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
    this.notifyIfUpdateError(result, projectEntity, byPlayer)
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
    this.notifyIfMoveError(result, compatible, byPlayer)
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

  tryUpdateEntityFromWorld(
    entity: ProjectEntity,
    stage: StageNumber,
    items: BlueprintInsertPlan[] | nil,
  ): EntityUpdateResult {
    const entitySource = this.worldPresenter.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return this.handleUpdate(entity, entitySource, stage, entitySource.direction, nil, true, items)
  }

  tryRotateEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
    const entitySource = this.worldPresenter.getWorldEntity(entity, stage)
    if (!entitySource) return EntityUpdateResult.NoChange
    return this.handleUpdate(entity, entitySource, stage, entitySource.direction, nil, false, nil)
  }

  tryUpgradeEntityFromWorld(entity: ProjectEntity, stage: StageNumber): EntityUpdateResult {
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
      return this.handleUndergroundBeltUpdate(
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

  private updatePair(
    entity1: UndergroundBeltProjectEntity,
    entity1Stage: StageNumber,
    entity2: UndergroundBeltProjectEntity,
    entity2Stage: StageNumber,
  ): void {
    this.worldPresenter.refreshEntity(entity1, entity1Stage)
    this.worldPresenter.refreshEntity(entity2, entity2Stage)
  }

  private handleUndergroundFlippedBack(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction,
    pair: UndergroundBeltProjectEntity | nil,
  ): EntityUpdateResult {
    if (!pair) {
      this.worldPresenter.refreshEntity(entity, stage)
      return EntityUpdateResult.NoChange
    }
    if (pair.direction == targetDirection) {
      this.updatePair(entity, entity.firstStage, pair, pair.firstStage)
      return EntityUpdateResult.NoChange
    }
    const rotateAllowed = stage == entity.firstStage || pair.firstStage == stage
    if (!rotateAllowed) {
      forceFlipUnderground(worldEntity)
      return EntityUpdateResult.CannotRotate
    }
    const oppositeType = worldEntity.belt_to_ground_type == "input" ? "output" : "input"
    this.content.batch(() => {
      this.content.setEntityDirection(pair, worldEntity.direction)
      this.content.setTypeProperty(pair, oppositeType)
    })
    this.updatePair(entity, entity.firstStage, pair, pair.firstStage)
    return EntityUpdateResult.Updated
  }

  private doUndergroundBeltUpdate(
    thisUg: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    pair: UndergroundBeltProjectEntity | nil,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: NameAndQuality,
  ): EntityUpdateResult {
    const rotated = targetDirection && targetDirection != thisUg.direction

    const oldUpgrade = thisUg.getUpgradeAtStage(stage)
    const upgraded = targetUpgrade.name != oldUpgrade.name || targetUpgrade.quality != oldUpgrade.quality

    if (!rotated && !upgraded) {
      if (!targetDirection) return EntityUpdateResult.NoChange
      return this.handleUndergroundFlippedBack(thisUg, worldEntity, stage, targetDirection, pair)
    }

    const isSelfOrPairFirstStage = stage == thisUg.firstStage || (pair && pair.firstStage == stage)

    if (rotated) {
      const rotateAllowed = isSelfOrPairFirstStage
      if (!rotateAllowed) {
        this.worldPresenter.resetUnderground(thisUg, stage)
        return EntityUpdateResult.CannotRotate
      }

      const oldType = thisUg.firstValue.type
      const newType = oldType == "input" ? "output" : "input"
      this.content.batch(() => {
        this.content.setEntityDirection(thisUg, targetDirection)
        this.content.setTypeProperty(thisUg, newType)
        if (pair) {
          this.content.setEntityDirection(pair, targetDirection)
          this.content.setTypeProperty(pair, oldType)
        }
      })
    }

    const applyStage = isSelfOrPairFirstStage ? thisUg.firstStage : stage
    const pairApplyStage = pair && isSelfOrPairFirstStage ? pair.firstStage : stage
    let cannotUpgradeChangedPair = false
    let newPair: UndergroundBeltProjectEntity | nil = nil
    if (upgraded) {
      this.content.applyEntityUpgrade(thisUg, applyStage, targetUpgrade)
      newPair = findUndergroundPair(this.content, thisUg, stage, targetUpgrade.name)
      if (pair == nil) {
        if (newPair != nil) {
          const pairPair = findUndergroundPair(this.content, newPair, stage, nil, thisUg)
          cannotUpgradeChangedPair = pairPair != nil && pairPair != thisUg
        }
      } else {
        cannotUpgradeChangedPair = newPair != nil && newPair != pair
      }
      if (cannotUpgradeChangedPair) {
        this.content.applyEntityUpgrade(thisUg, stage, oldUpgrade)
      } else if (pair) {
        if (undergroundCanReach(thisUg, pair, targetUpgrade.name)) {
          this.content.applyEntityUpgrade(pair, pairApplyStage, targetUpgrade)
        } else {
          pair = nil
        }
      }
    }

    if (cannotUpgradeChangedPair && !rotated) {
      this.worldPresenter.refreshEntity(thisUg, stage)
      if (pair) this.worldPresenter.refreshEntity(pair, stage)
    } else if (!pair) {
      this.worldPresenter.refreshEntity(thisUg, applyStage)
    } else {
      this.updatePair(thisUg, applyStage, pair, pairApplyStage)
    }
    return cannotUpgradeChangedPair ? EntityUpdateResult.CannotUpgradeChangedPair : EntityUpdateResult.Updated
  }

  private handleUndergroundBeltUpdate(
    entity: UndergroundBeltProjectEntity,
    worldEntity: LuaEntity,
    stage: StageNumber,
    targetDirection: defines.direction | nil,
    targetUpgrade: NameAndQuality,
  ): EntityUpdateResult {
    const pair = findUndergroundPair(this.content, entity, stage)
    const updateResult = this.doUndergroundBeltUpdate(entity, worldEntity, pair, stage, targetDirection, targetUpgrade)

    const newWorldEntity = this.worldPresenter.getWorldEntity(entity, stage)
    if (newWorldEntity) {
      const worldPair = newWorldEntity.neighbours as LuaEntity | nil
      if (worldPair && (!pair || this.worldPresenter.getWorldEntity(pair, stage) != worldPair)) {
        const worldPairEntity = this.content.findCompatibleWithLuaEntity(worldPair, nil, stage)
        if (worldPairEntity) this.worldPresenter.refreshEntity(worldPairEntity, stage)
      }
    }

    return updateResult
  }

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
    this.notifyIfUpdateError(result, projectEntity, byPlayer)

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

  updateWiresFromWorld(entity: ProjectEntity, stage: StageNumber): WireUpdateResult {
    const connectionsChanged = saveWireConnections(this.content, entity, stage, stage, this.worldPresenter)
    if (!connectionsChanged) return WireUpdateResult.NoChange
    return WireUpdateResult.Updated
  }

  // === Upgrade ===

  onEntityMarkedForUpgrade(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const projectEntity = this.getCompatibleAtCurrentStageOrAdd(entity, stage, nil, byPlayer)
    if (!projectEntity) return

    const result = this.tryUpgradeEntityFromWorld(projectEntity, stage)
    this.notifyIfUpdateError(result, projectEntity, byPlayer)
    if (entity.valid) entity.cancel_upgrade(entity.force)
  }

  // === Tools ===

  onCleanupToolUsed(entity: LuaEntity, stage: StageNumber): void {
    this.onTryFixEntity(entity, stage, true)
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

  onEntityForceDeleteUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (projectEntity) {
      this.forceDeleteEntity(projectEntity)
      return undoDeleteEntity.createAction(byPlayer, { project: this.project, entity: projectEntity })
    }
    return nil
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

  setValueFromStagedInfo(
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
      this.replaceUnstagedValueViaContent(entity, info)

      if (entity.isUndergroundBelt()) {
        this.handleUndergroundBeltValueSet(entity, oldStageDiffs, stageDiffs)
      }
    })
    return moveResult
  }

  private replaceUnstagedValueDirect(entity: ProjectEntity<Entity>, info: StageInfoExport<Entity>): void {
    const unstagedValues = info.unstagedValue
    if (unstagedValues != nil) {
      const entityMut = entity._asMut()
      entityMut.clearPropertyInAllStages("unstagedValue")
      for (const [stage, value] of pairs(unstagedValues)) {
        const stageNumber = tonumber(stage)
        if (stageNumber == nil) continue
        entityMut.setUnstagedValue(stageNumber, value)
      }
    }
  }

  private replaceUnstagedValueViaContent(entity: ProjectEntity<Entity>, info: StageInfoExport<Entity>): void {
    const unstagedValues = info.unstagedValue
    if (unstagedValues != nil) {
      this.content.batch(() => {
        this.content.clearEntityUnstagedValues(entity)
        for (const [stage, value] of pairs(unstagedValues)) {
          const stageNumber = tonumber(stage)
          if (stageNumber == nil) continue
          this.content.setEntityUnstagedValue(entity, stageNumber, value)
        }
      })
    }
  }

  private handleUndergroundBeltValueSet(
    entity: UndergroundBeltProjectEntity,
    oldStageDiffs: StageDiffs | nil,
    stageDiffs: StageDiffs | nil,
  ): void {
    const possiblyUpdatedStages = newLuaSet<StageNumber>()
    if (oldStageDiffs) {
      for (const [stage] of pairs(oldStageDiffs)) possiblyUpdatedStages.add(stage)
    }
    if (stageDiffs) {
      for (const [stage] of pairs(stageDiffs)) possiblyUpdatedStages.add(stage)
    }
    const ugPairs = newLuaSet<UndergroundBeltProjectEntity>()
    for (const stage of possiblyUpdatedStages) {
      const pair = findUndergroundPair(this.content, entity, stage)
      if (pair) ugPairs.add(pair)
    }
    for (const pair of ugPairs) {
      this.worldPresenter.refreshEntity(pair, pair.firstStage)
    }
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
      for (const entity of projectEntities) this.worldPresenter.destroyAllWorldOrPreviewEntities(entity)
      for (const entity of projectEntities) this.worldPresenter.rebuildEntity(entity, stage)
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
      this.worldPresenter.rebuildEntity(entity, stage)
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
        this.worldPresenter.rebuildEntity(projectEntity, stage)
      } else {
        this.addNewEntity(luaEntity, stage)
      }
    }
  }

  // === Tiles ===

  setTileAtStage(position: Position, stage: StageNumber, value: string | nil): void {
    let tile = this.content.tiles.get(position.x, position.y)

    if (!tile && value != nil) {
      tile = createProjectTile()
      this.content.setTile(position, tile)
    }

    if (!tile) return

    tile.setTileAtStage(stage, value)

    const wasEmpty = tile.isEmpty()
    if (wasEmpty) {
      this.content.deleteTile(position)
    }

    const collision = this.worldPresenter.updateTiles(position, stage)

    if (collision) {
      if (wasEmpty) {
        tile = createProjectTile()
        this.content.setTile(position, tile)
      }
      tile.setTileAtStage(collision.stage, collision.actualValue)
    }
  }

  deleteTile(position: Position): boolean {
    const result = this.content.deleteTile(position)
    if (result) {
      this.worldPresenter.updateTiles(position, 1)
    }
    return result
  }

  scanProjectForExistingTiles(): void {
    const bbox = this.content.computeBoundingBox()
    const tilesToUpdateArray: Array<[Position, ProjectTile]> = []
    const tilesToUpdateSet = new LuaSet<ProjectTile>()

    for (const stage of $range(1, this.project.settings.stageCount())) {
      const surface = this.project.surfaces.getSurface(stage)!
      const tiles = surface.find_tiles_filtered({
        area: bbox,
        name: Object.keys(getPrototypeInfo().blueprintableTiles),
      })

      for (const tile of tiles) {
        const position = tile.position
        let projectTile = this.content.tiles.get(position.x, position.y)

        if (!projectTile) {
          projectTile = createProjectTile()
          this.content.setTile(position, projectTile)
        }

        projectTile.setTileAtStage(stage, tile.name)
        if (!tilesToUpdateSet.has(projectTile)) {
          tilesToUpdateArray.push([position, projectTile])
          tilesToUpdateSet.add(projectTile)
        }
      }
    }

    for (const [position, tile] of tilesToUpdateArray) {
      this.worldPresenter.updateTiles(position, tile.getFirstStage())
    }
  }

  // === Tile events ===

  onTileBuilt(position: Position, name: string, stage: StageNumber): void {
    if (!this.blueprintableTiles.has(name)) {
      this.setTileAtStage(position, stage, nil)
      return
    }
    this.setTileAtStage(position, stage, name)
  }

  onTileMined(position: Position, stage: StageNumber): void {
    this.setTileAtStage(position, stage, nil)
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
      return lastStageChangeUndo.createAction(byPlayer, { project: this.project, entity: projectEntity, oldLastStage })
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
      return undoBringToStage.createAction(byPlayer, { project: this.project, entity: projectEntity, oldStage })
    }
  }

  onBringDownToStageUsed(entity: LuaEntity, stage: StageNumber, byPlayer: PlayerIndex): UndoAction | nil {
    const projectEntity = this.content.findCompatibleFromPreviewOrLuaEntity(entity, stage)
    if (!projectEntity || projectEntity.isSettingsRemnant) return
    if (projectEntity.firstStage <= stage) return
    const oldStage = projectEntity.firstStage
    if (this.userBringEntityToStage(projectEntity, stage, byPlayer)) {
      return undoBringToStage.createAction(byPlayer, { project: this.project, entity: projectEntity, oldStage })
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
      return undoSendToStage.createAction(byPlayer, {
        project: this.project,
        entity: projectEntity,
        oldStage: fromStage,
      })
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

  // === Surface ===

  onSurfaceCleared(stage: StageNumber): void {
    const area = this.content.computeBoundingBox()
    for (const entity of this.content.allEntities()) {
      this.worldPresenter.deleteEntityAtStage(entity, stage)
    }
    if (area) prepareArea(this.project.surfaces.getSurface(stage)!, area)
  }

  // === User actions with undo ===

  userRevivedSettingsRemnant(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex | nil): void {
    const result = this.tryReviveSettingsRemnant(entity, stage)
    if (result != "updated" && result != "no-change") {
      this.notifyIfMoveError(result, entity, byPlayer)
      this.worldPresenter.refreshEntity(entity, stage)
    }
  }

  userMoveEntityToStageWithUndo(entity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): void {
    const undoAction = this.userTryMoveEntityToStageWithUndo(entity, stage, byPlayer)
    if (undoAction) {
      registerUndoAction(undoAction)
    }
  }

  userSetLastStageWithUndo(projectEntity: ProjectEntity, newLastStage: StageNumber | nil, byPlayer: PlayerIndex): void {
    const undoAction = this.userTrySetLastStageWithUndo(projectEntity, newLastStage, byPlayer)
    if (undoAction) registerUndoAction(undoAction)
  }

  userBringEntityToStage(projectEntity: ProjectEntity, stage: StageNumber, byPlayer: PlayerIndex): boolean {
    const oldStage = projectEntity.firstStage
    if (oldStage == stage) return false
    const result = this.trySetFirstStage(projectEntity, stage)
    if (result != "updated") {
      this.notifyIfMoveError(result, projectEntity, byPlayer)
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
      this.notifyIfMoveError(result, projectEntity, byPlayer)
      return false
    }
    if (toStage < fromStage) createIndicator(projectEntity, byPlayer, "<<", Colors.Orange)
    return true
  }

  // Internal undo helpers

  findCompatibleEntityForUndo(entity: ProjectEntity): ProjectEntity | nil {
    if (!this.project.valid) return nil

    if (!this.content.hasEntity(entity)) {
      const matching = this.content.findCompatibleWithExistingEntity(entity, entity.firstStage)
      if (!matching || entity.firstStage != matching.firstStage || !deepCompare(entity.firstValue, matching.firstValue))
        return nil
      return matching
    }
    return entity
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
          [L_Interaction.EntityMovedBackToStage, this.project.settings.getStageName(stage)],
          false,
        )
      } else {
        createNotification(
          entity,
          byPlayer,
          [L_Interaction.EntityMovedFromStage, this.project.settings.getStageName(oldStage)],
          false,
        )
      }
      return true
    }

    if (result == "no-change") {
      createNotification(entity, byPlayer, [L_Interaction.AlreadyAtFirstStage], true)
    } else {
      this.notifyIfMoveError(result, entity, byPlayer)
    }
    return false
  }

  userTrySetLastStage(
    projectEntity: ProjectEntity,
    newLastStage: StageNumber | nil,
    byPlayer: PlayerIndex | nil,
  ): boolean {
    const result = this.trySetLastStage(projectEntity, newLastStage)
    this.notifyIfMoveError(result, projectEntity, byPlayer)
    return result == StageMoveResult.Updated
  }

  private userTryMoveEntityToStageWithUndo(
    entity: ProjectEntity,
    stage: StageNumber,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const oldStage = entity.firstStage
    if (this.userTryMoveEntityToStage(entity, stage, byPlayer)) {
      return undoManualStageMove.createAction(byPlayer, { project: this.project, entity, oldStage })
    }
  }

  private userTrySetLastStageWithUndo(
    projectEntity: ProjectEntity,
    stage: StageNumber | nil,
    byPlayer: PlayerIndex,
  ): UndoAction | nil {
    const oldStage = projectEntity.lastStage
    if (this.userTrySetLastStage(projectEntity, stage, byPlayer)) {
      return lastStageChangeUndo.createAction(byPlayer, {
        project: this.project,
        entity: projectEntity,
        oldLastStage: oldStage,
      })
    }
  }

  // === Notification helpers ===

  private notifyIfUpdateError(result: EntityUpdateResult, entity: ProjectEntity, byPlayer: PlayerIndex | nil): void {
    if (result == "no-change" || result == "updated") return
    if (result == "cannot-rotate") {
      createNotification(entity, byPlayer, [L_Game.CantBeRotated], true)
    } else if (result == "cannot-upgrade-changed-pair") {
      createNotification(entity, byPlayer, [L_Interaction.CannotUpgradeUndergroundChangedPair], true)
    } else {
      assertNever(result)
    }
  }

  private notifyIfMoveError(result: StageMoveResult, entity: ProjectEntity, byPlayer: PlayerIndex | nil): void {
    if (
      result == StageMoveResult.Updated ||
      result == StageMoveResult.NoChange ||
      result == StageMoveResult.EntityIsPersistent
    )
      return

    if (result == StageMoveResult.CannotMovePastLastStage) {
      createNotification(entity, byPlayer, [L_Interaction.CannotMovePastLastStage], true)
    } else if (result == StageMoveResult.CannotMoveBeforeFirstStage) {
      createNotification(entity, byPlayer, [L_Interaction.CannotDeleteBeforeFirstStage], true)
    } else if (result == StageMoveResult.IntersectsAnotherEntity) {
      createNotification(entity, byPlayer, [L_Interaction.MoveWillIntersectAnotherEntity], true)
    } else {
      assertNever(result)
    }
  }
}

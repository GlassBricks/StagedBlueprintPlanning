import { LuaEntity } from "factorio:runtime"
import { MutableProjectContent } from "../../entity/ProjectContent"
import {
  InternalProjectEntity,
  InternalUndergroundBeltProjectEntity,
  NameAndQuality,
  StageDiffs,
  StageNumber,
  UndergroundBeltProjectEntity,
} from "../../entity/ProjectEntity"
import { forceFlipUnderground } from "../../entity/save-load"
import { findUndergroundPair, undergroundCanReach } from "../../entity/underground-belt"
import { EntityUpdateResult } from "./undo-records"
import { WorldPresenter } from "../WorldPresentation"

interface UndergroundBeltContext {
  readonly content: MutableProjectContent
  readonly worldPresenter: WorldPresenter
}

function updatePair(
  ctx: UndergroundBeltContext,
  entity1: UndergroundBeltProjectEntity,
  entity1Stage: StageNumber,
  entity2: UndergroundBeltProjectEntity,
  entity2Stage: StageNumber,
): void {
  ctx.worldPresenter.refreshEntity(entity1, entity1Stage)
  ctx.worldPresenter.refreshEntity(entity2, entity2Stage)
}

function handleUndergroundFlippedBack(
  ctx: UndergroundBeltContext,
  entity: UndergroundBeltProjectEntity,
  worldEntity: LuaEntity,
  stage: StageNumber,
  targetDirection: defines.direction,
  pair: UndergroundBeltProjectEntity | nil,
): EntityUpdateResult {
  if (!pair) {
    ctx.worldPresenter.refreshEntity(entity, stage)
    return EntityUpdateResult.NoChange
  }
  if (pair.direction == targetDirection) {
    updatePair(ctx, entity, entity.firstStage, pair, pair.firstStage)
    return EntityUpdateResult.NoChange
  }
  const rotateAllowed = stage == entity.firstStage || pair.firstStage == stage
  if (!rotateAllowed) {
    forceFlipUnderground(worldEntity)
    return EntityUpdateResult.CannotRotate
  }
  const oppositeType = worldEntity.belt_to_ground_type == "input" ? "output" : "input"
  ctx.content.batch(() => {
    ctx.content.setEntityDirection(pair, worldEntity.direction)
    ctx.content.setTypeProperty(pair, oppositeType)
  })
  updatePair(ctx, entity, entity.firstStage, pair, pair.firstStage)
  return EntityUpdateResult.Updated
}

function doUndergroundBeltUpdate(
  ctx: UndergroundBeltContext,
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
    return handleUndergroundFlippedBack(ctx, thisUg, worldEntity, stage, targetDirection, pair)
  }

  const isSelfOrPairFirstStage = stage == thisUg.firstStage || (pair && pair.firstStage == stage)

  if (rotated) {
    const rotateAllowed = isSelfOrPairFirstStage
    if (!rotateAllowed) {
      ctx.worldPresenter.resetUnderground(thisUg, stage)
      return EntityUpdateResult.CannotRotate
    }

    const oldType = thisUg.firstValue.type
    const newType = oldType == "input" ? "output" : "input"
    ctx.content.batch(() => {
      ctx.content.setEntityDirection(thisUg, targetDirection)
      ctx.content.setTypeProperty(thisUg, newType)
      if (pair) {
        ctx.content.setEntityDirection(pair, targetDirection)
        ctx.content.setTypeProperty(pair, oldType)
      }
    })
  }

  const applyStage = isSelfOrPairFirstStage ? thisUg.firstStage : stage
  const pairApplyStage = pair && isSelfOrPairFirstStage ? pair.firstStage : stage
  let cannotUpgradeChangedPair = false
  let newPair: UndergroundBeltProjectEntity | nil = nil
  if (upgraded) {
    ctx.content.applyEntityUpgrade(thisUg, applyStage, targetUpgrade)
    newPair = findUndergroundPair(ctx.content, thisUg, stage, targetUpgrade.name)
    if (pair == nil) {
      if (newPair != nil) {
        const pairPair = findUndergroundPair(ctx.content, newPair, stage, nil, thisUg)
        cannotUpgradeChangedPair = pairPair != nil && pairPair != thisUg
      }
    } else {
      cannotUpgradeChangedPair = newPair != nil && newPair != pair
    }
    if (cannotUpgradeChangedPair) {
      ctx.content.applyEntityUpgrade(thisUg, stage, oldUpgrade)
    } else if (pair) {
      if (undergroundCanReach(thisUg, pair, targetUpgrade.name)) {
        ctx.content.applyEntityUpgrade(pair, pairApplyStage, targetUpgrade)
      } else {
        pair = nil
      }
    }
  }

  if (cannotUpgradeChangedPair && !rotated) {
    ctx.worldPresenter.refreshEntity(thisUg, stage)
    if (pair) ctx.worldPresenter.refreshEntity(pair, stage)
  } else if (!pair) {
    ctx.worldPresenter.refreshEntity(thisUg, applyStage)
  } else {
    updatePair(ctx, thisUg, applyStage, pair, pairApplyStage)
  }
  return cannotUpgradeChangedPair ? EntityUpdateResult.CannotUpgradeChangedPair : EntityUpdateResult.Updated
}

export function handleUndergroundBeltUpdate(
  ctx: UndergroundBeltContext,
  entity: UndergroundBeltProjectEntity,
  worldEntity: LuaEntity,
  stage: StageNumber,
  targetDirection: defines.direction | nil,
  targetUpgrade: NameAndQuality,
): EntityUpdateResult {
  const pair = findUndergroundPair(ctx.content, entity, stage)
  const updateResult = doUndergroundBeltUpdate(ctx, entity, worldEntity, pair, stage, targetDirection, targetUpgrade)

  const newWorldEntity = ctx.worldPresenter.getWorldEntity(entity, stage)
  if (newWorldEntity) {
    const worldPair = newWorldEntity.neighbours as LuaEntity | nil
    if (worldPair && (!pair || ctx.worldPresenter.getWorldEntity(pair, stage) != worldPair)) {
      const worldPairEntity = ctx.content.findCompatibleWithLuaEntity(worldPair, nil, stage)
      if (worldPairEntity) ctx.worldPresenter.refreshEntity(worldPairEntity, stage)
    }
  }

  return updateResult
}

export function handleUndergroundBeltValueSet(
  ctx: UndergroundBeltContext,
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
    const pair = findUndergroundPair(ctx.content, entity, stage)
    if (pair) ugPairs.add(pair)
  }
  for (const pair of ugPairs) {
    ctx.worldPresenter.refreshEntity(pair, pair.firstStage)
  }
}

export function fixNewUndergroundBelt(
  content: MutableProjectContent,
  projectEntity: InternalProjectEntity,
  entity: LuaEntity,
  stage: StageNumber,
): void {
  if (entity.type != "underground-belt") return
  assume<InternalUndergroundBeltProjectEntity>(projectEntity)
  const pair = findUndergroundPair(content, projectEntity, stage)
  if (!pair) return
  const expectedType = pair.firstValue.type == "output" ? "input" : "output"
  if (expectedType != projectEntity.firstValue.type) {
    projectEntity.setTypeProperty(expectedType)
    projectEntity.direction = pair.direction
  }
}

import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { UndoHandler } from "./undo"
import type { ProjectActions } from "./ProjectActions"

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
  actions: ProjectActions
  entity: ProjectEntity
}

interface StageChangeRecord extends ProjectEntityRecord {
  oldStage: StageNumber
}

interface LastStageChangeRecord extends ProjectEntityRecord {
  oldLastStage: StageNumber | nil
}

export const undoDeleteEntity = UndoHandler<ProjectEntityRecord>("delete entity", (_, { actions, entity }) => {
  actions.readdDeletedEntity(entity)
})

export const undoManualStageMove = UndoHandler<StageChangeRecord>(
  "stage move",
  (player, { actions, entity, oldStage }) => {
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userTryMoveEntityToStage(actualEntity, oldStage, player.index, true)
    }
  },
)

export const undoSendToStage = UndoHandler<StageChangeRecord>(
  "send to stage",
  (player, { actions, entity, oldStage }) => {
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userBringEntityToStage(actualEntity, oldStage, player.index)
    }
  },
)

export const undoBringToStage = UndoHandler<StageChangeRecord>(
  "bring to stage",
  (player, { actions, entity, oldStage }) => {
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userSendEntityToStage(actualEntity, actualEntity.firstStage, oldStage, player.index)
    }
  },
)

export const lastStageChangeUndo = UndoHandler(
  "last stage change",
  (player, { actions, entity, oldLastStage }: LastStageChangeRecord) => {
    const actualEntity = actions.findCompatibleEntityForUndo(entity)
    if (actualEntity) {
      actions.userTrySetLastStage(actualEntity, oldLastStage, player.index)
    }
  },
)

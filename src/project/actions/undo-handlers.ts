import { LuaPlayer, MapPosition } from "factorio:runtime"

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
import { MutableProjectContent } from "../../entity/ProjectContent"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { getDirectionalInfo, ProjectWireConnection } from "../../entity/wire-connection"
import { EntityExport, exportEntity, importEntity } from "../../import-export/entity"
import { ProjectId } from "../Project"
import { getProjectById } from "../ProjectList"
import { ProjectActions } from "./ProjectActions"
import { UndoAction, UndoHandler } from "./undo"

function getActionsForUndo(projectId: ProjectId): ProjectActions | nil {
  const project = getProjectById(projectId)
  if (!project) return nil
  return project.actions
}

function findEntityForUndoTag(
  content: MutableProjectContent,
  position: MapPosition,
  firstName: string,
  firstStage: StageNumber,
): ProjectEntity | nil {
  return content.findCompatibleEntity(firstName, position, nil, firstStage)
}

interface ExternalWireConnection {
  otherPosition: MapPosition
  otherName: string
  fromId: defines.wire_connector_id
  toId: defines.wire_connector_id
}

function exportWireConnections(entity: ProjectEntity): ExternalWireConnection[] {
  const wires = entity.wireConnections
  if (!wires) return []
  const result: ExternalWireConnection[] = []
  for (const [otherEntity, connections] of wires) {
    for (const connection of connections) {
      const [, fromId, toId] = getDirectionalInfo(connection, entity)
      result.push({
        otherPosition: otherEntity.position,
        otherName: otherEntity.firstValue.name,
        fromId,
        toId,
      })
    }
  }
  return result
}

function restoreWireConnections(
  content: MutableProjectContent,
  entity: ProjectEntity,
  wires: ExternalWireConnection[],
): void {
  for (const wire of wires) {
    const otherEntity = content.findCompatibleEntity(wire.otherName, wire.otherPosition, nil, 1)
    if (!otherEntity) continue
    const connection: ProjectWireConnection = {
      fromEntity: entity,
      fromId: wire.fromId,
      toEntity: otherEntity,
      toId: wire.toId,
    }
    content.addWireConnection(connection)
  }
}

interface DeleteEntityTagData {
  entityExport: EntityExport
  wires: ExternalWireConnection[]
  projectId: ProjectId
}

function undoDeleteEntity(_player: LuaPlayer, data: DeleteEntityTagData): DeleteEntityTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = importEntity(data.entityExport)
  actions.content.addEntity(entity)
  restoreWireConnections(actions.content, entity, data.wires)
  return data
}

function redoDeleteEntity(_player: LuaPlayer, data: DeleteEntityTagData): DeleteEntityTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(
    actions.content,
    data.entityExport.position,
    data.entityExport.firstValue.name,
    data.entityExport.firstStage,
  )
  if (!entity) return nil
  const wires = exportWireConnections(entity)
  const entityExport = exportEntity(entity)
  actions.forceDeleteEntity(entity)
  return { entityExport, wires, projectId: data.projectId }
}

export const tagUndoDeleteEntity = UndoHandler<DeleteEntityTagData>("delete entity", undoDeleteEntity, redoDeleteEntity)

export function createDeleteEntityUndoData(entity: ProjectEntity, projectId: ProjectId): DeleteEntityTagData {
  return {
    entityExport: exportEntity(entity),
    wires: exportWireConnections(entity),
    projectId,
  }
}

interface StageMoveTagData {
  projectId: ProjectId
  position: MapPosition
  name: string
  oldStage: StageNumber
  newStage: StageNumber
}

function moveEntityToStage(player: LuaPlayer, data: StageMoveTagData): StageMoveTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(actions.content, data.position, data.name, data.newStage)
  if (!entity) return nil
  if (actions.userTryMoveEntityToStage(entity, data.oldStage, player.index, true)) {
    return { ...data, oldStage: data.newStage, newStage: data.oldStage }
  }
  return nil
}

export const tagUndoManualStageMove = UndoHandler<StageMoveTagData>("stage move", moveEntityToStage, moveEntityToStage)

function undoSendToStage(player: LuaPlayer, data: StageMoveTagData): StageMoveTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(actions.content, data.position, data.name, data.newStage)
  if (!entity) return nil
  if (actions.userBringEntityToStage(entity, data.oldStage, player.index)) {
    return { ...data, oldStage: data.newStage, newStage: data.oldStage }
  }
  return nil
}

function redoSendToStage(player: LuaPlayer, data: StageMoveTagData): StageMoveTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(actions.content, data.position, data.name, data.newStage)
  if (!entity) return nil
  if (actions.userSendEntityToStage(entity, entity.firstStage, data.oldStage, player.index)) {
    return { ...data, oldStage: data.newStage, newStage: data.oldStage }
  }
  return nil
}

export const tagUndoSendToStage = UndoHandler<StageMoveTagData>("send to stage", undoSendToStage, redoSendToStage)

function undoBringToStage(player: LuaPlayer, data: StageMoveTagData): StageMoveTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(actions.content, data.position, data.name, data.newStage)
  if (!entity) return nil
  if (actions.userSendEntityToStage(entity, entity.firstStage, data.oldStage, player.index)) {
    return { ...data, oldStage: data.newStage, newStage: data.oldStage }
  }
  return nil
}

function redoBringToStage(player: LuaPlayer, data: StageMoveTagData): StageMoveTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(actions.content, data.position, data.name, data.newStage)
  if (!entity) return nil
  if (actions.userBringEntityToStage(entity, data.oldStage, player.index)) {
    return { ...data, oldStage: data.newStage, newStage: data.oldStage }
  }
  return nil
}

export const tagUndoBringToStage = UndoHandler<StageMoveTagData>("bring to stage", undoBringToStage, redoBringToStage)

interface LastStageChangeTagData {
  projectId: ProjectId
  position: MapPosition
  name: string
  firstStage: StageNumber
  oldLastStage: StageNumber | nil
  newLastStage: StageNumber | nil
}

function setLastStage(player: LuaPlayer, data: LastStageChangeTagData): LastStageChangeTagData | nil {
  const actions = getActionsForUndo(data.projectId)
  if (!actions) return nil
  const entity = findEntityForUndoTag(actions.content, data.position, data.name, data.firstStage)
  if (!entity) return nil
  if (actions.userTrySetLastStage(entity, data.oldLastStage, player.index)) {
    return { ...data, oldLastStage: data.newLastStage, newLastStage: data.oldLastStage }
  }
  return nil
}

export const tagUndoLastStageChange = UndoHandler<LastStageChangeTagData>(
  "last stage change",
  setLastStage,
  setLastStage,
)

export function createStageMoveData(
  projectId: ProjectId,
  entity: ProjectEntity,
  oldStage: StageNumber,
  newStage: StageNumber,
): UndoAction<StageMoveTagData> {
  return tagUndoManualStageMove.createAction({
    projectId,
    position: entity.position,
    name: entity.firstValue.name,
    oldStage,
    newStage,
  })
}

export function createSendToStageData(
  projectId: ProjectId,
  entity: ProjectEntity,
  oldStage: StageNumber,
  newStage: StageNumber,
): UndoAction<StageMoveTagData> {
  return tagUndoSendToStage.createAction({
    projectId,
    position: entity.position,
    name: entity.firstValue.name,
    oldStage,
    newStage,
  })
}

export function createBringToStageData(
  projectId: ProjectId,
  entity: ProjectEntity,
  oldStage: StageNumber,
  newStage: StageNumber,
): UndoAction<StageMoveTagData> {
  return tagUndoBringToStage.createAction({
    projectId,
    position: entity.position,
    name: entity.firstValue.name,
    oldStage,
    newStage,
  })
}

export function createLastStageChangeData(
  projectId: ProjectId,
  entity: ProjectEntity,
  oldLastStage: StageNumber | nil,
  newLastStage: StageNumber | nil,
): UndoAction<LastStageChangeTagData> {
  return tagUndoLastStageChange.createAction({
    projectId,
    position: entity.position,
    name: entity.firstValue.name,
    firstStage: entity.firstStage,
    oldLastStage,
    newLastStage,
  })
}

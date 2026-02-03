import { LuaEntity, LuaSurface, PlayerIndex, UnitNumber } from "factorio:runtime"
import { Prototypes } from "../../constants"
import { isPreviewEntity } from "../../entity/prototype-info"
import { isWorldEntityProjectEntity } from "../../entity/ProjectEntity"
import { getRegisteredProjectEntityFromUnitNumber, getStageFromUnitNumber } from "../../entity/registration"
import { ProtectedEvents } from "../../lib"
import { getStageAtSurface } from "../project-refs"
import { Stage } from "../Project"
import { UndoAction } from "../actions/undo"

const Events = ProtectedEvents

export interface EventHandlerState {
  lastPreBuild?: {
    event: import("factorio:runtime").OnPreBuildEvent
    item: string | nil
    surface: LuaSurface
  }

  preMinedItemCalled?: boolean

  accumulatedUndoActions?: UndoAction[]
}

let state: EventHandlerState

declare global {
  interface PlayerData {
    lastWireAffectedEntity?: LuaEntity
    possiblyOpenedModdedEntity?: import("../../entity/Entity").LuaEntityInfo & {
      original: LuaEntity
    }
    confirmedModdedEntityOpen?: true
  }
}
declare const storage: StorageWithPlayer & {
  worldListenerState: EventHandlerState
}
Events.on_init(() => {
  state = storage.worldListenerState = {}
})
Events.on_load(() => {
  state = storage.worldListenerState
})

export function getState(): EventHandlerState {
  return state
}

export function getStageAtEntity(entity: LuaEntity): Stage | nil {
  if (entity.valid && isWorldEntityProjectEntity(entity)) {
    return getStageAtSurface(entity.surface_index)
  }
}

export function getStageAtEntityOrPreview(entity: LuaEntity): Stage | nil {
  if (entity.valid && (isWorldEntityProjectEntity(entity) || isPreviewEntity(entity))) {
    return getStageAtSurface(entity.surface_index)
  }
}

export function getInnerName(entity: LuaEntity): string {
  if (entity.type == "entity-ghost") return entity.ghost_name
  return entity.name
}

export function luaEntityCreated(entity: LuaEntity, player: PlayerIndex | nil): void {
  if (!entity.valid) return
  if (getInnerName(entity) == (Prototypes.EntityMarker as string)) {
    entity.destroy()
    return
  }
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return
  if (isWorldEntityProjectEntity(entity)) {
    stage.actions.onEntityCreated(entity, stage.stageNumber, player)
  }
}

export function luaEntityDeleted(entity: LuaEntity): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityDeleted(entity, stage.stageNumber)
}

export function luaEntityPossiblyUpdated(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityPossiblyUpdated(entity, stage.stageNumber, nil, player)
}

export function luaEntityMarkedForUpgrade(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityMarkedForUpgrade(entity, stage.stageNumber, player)
}

export function luaEntityDied(entity: LuaEntity): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityDied(entity, stage.stageNumber)
}

export function luaEntityRotated(
  entity: LuaEntity,
  previousDirection: defines.direction,
  player: PlayerIndex | nil,
): void {
  if (!entity.valid) return
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return
  if (isWorldEntityProjectEntity(entity)) {
    stage.actions.onEntityRotated(entity, stage.stageNumber, previousDirection, player)
    return
  }
  if (isPreviewEntity(entity)) {
    entity.direction = previousDirection
    return
  }
}

export const checkForEntityUpdates = luaEntityPossiblyUpdated

export function checkForCircuitWireUpdates(entity: LuaEntity, byPlayer: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) {
    stage.actions.onWiresPossiblyUpdated(entity, stage.stageNumber, byPlayer)
  }
}

export function _resetState(): void {
  for (const [k] of pairs(state)) {
    state[k] = nil!
  }
}

export function _assertInValidState(): void {
  state.lastPreBuild = nil
  for (const [k, v] of pairs(state)) {
    state[k] = nil!
    assert(!v, `${k} was not cleaned up`)
  }
}

export function maybeDestroyObjectForStage(unitNumber: UnitNumber): void {
  const entity = getRegisteredProjectEntityFromUnitNumber(unitNumber)
  if (!entity) return
  const surfaceIndex = getStageFromUnitNumber(unitNumber)
  if (!surfaceIndex) return
  const stage = getStageAtSurface(surfaceIndex)
  if (!stage) return
  stage.project.actions.maybeDeleteProjectEntity(entity, stage.stageNumber)
}

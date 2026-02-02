import {
  BlueprintEntity,
  LuaEntity,
  LuaSurface,
  MapPosition,
  PlayerIndex,
  UndergroundBeltBlueprintEntity,
  UnitNumber,
} from "factorio:runtime"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { LuaEntityInfo } from "../../entity/Entity"
import {
  getCompatibleNames,
  getEntityType,
  getPrototypeRotationType,
  isPreviewEntity,
  isTwoDirectionTank,
  RotationType,
} from "../../entity/prototype-info"
import { isWorldEntityProjectEntity } from "../../entity/ProjectEntity"
import { getRegisteredProjectEntityFromUnitNumber, getStageFromUnitNumber } from "../../entity/registration"
import { StageInfoExport } from "../../import-export/entity"
import { isEmpty, ProtectedEvents } from "../../lib"
import { DelayedEvent } from "../../lib/delayed-event"
import { floorToCardinalDirection } from "../../lib/geometry"
import { getStageAtSurface } from "../project-refs"
import { Stage } from "../Project"
import { UndoAction } from "../actions/undo"

const Events = ProtectedEvents

export interface ToBeFastReplacedEntity extends LuaEntityInfo {
  readonly stage: Stage
}

export interface BplibPasteEntityData {
  readonly blueprintEntity: BlueprintEntity
  readonly worldPosition: MapPosition
}

export interface BplibPasteData {
  readonly stage: Stage
  readonly playerIndex: PlayerIndex
  readonly surface: LuaSurface
  readonly entities: readonly BplibPasteEntityData[]
  readonly allowPasteUpgrades: boolean
  readonly flipVertical: boolean
  readonly flipHorizontal: boolean
  readonly direction: defines.direction
}

export interface EventHandlerState {
  lastPreBuild?: {
    event: import("factorio:runtime").OnPreBuildEvent
    item: string | nil
    surface: LuaSurface
  }
  toBeFastReplaced?: ToBeFastReplacedEntity

  preMinedItemCalled?: boolean

  currentBlueprintPaste?: {
    stage: Stage
    entities: BlueprintEntity[]
    knownLuaEntities: import("../../lib").PRecord<number, LuaEntity>
    needsManualConnections: number[]
    originalNumEntities: number
    allowUpgrades: boolean
    flipVertical: boolean
    flipHorizontal: boolean
    direction: defines.direction
  }

  pendingBplibPaste?: BplibPasteData

  accumulatedUndoActions?: UndoAction[]
}

let state: EventHandlerState

declare global {
  interface PlayerData {
    lastWireAffectedEntity?: LuaEntity
    possiblyOpenedModdedEntity?: LuaEntityInfo & {
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

export function clearToBeFastReplaced(): void {
  const { toBeFastReplaced } = state
  if (toBeFastReplaced) {
    const { stage } = toBeFastReplaced
    if (stage.valid) {
      const { stageNumber } = stage
      stage.actions.onEntityDeleted(toBeFastReplaced, stageNumber)
    }
    state.toBeFastReplaced = nil
  }
}

export function setToBeFastReplaced(entity: LuaEntity, stage: Stage): void {
  const isUnderground = entity.type == "underground-belt"
  const newValue: ToBeFastReplacedEntity = {
    name: entity.name,
    type: entity.type,
    position: entity.position,
    direction: entity.direction,
    surface: entity.surface,
    belt_to_ground_type: isUnderground ? entity.belt_to_ground_type : nil,
    stage,
  }

  clearToBeFastReplaced()
  state.toBeFastReplaced = newValue
}

export function calculateTransformedDirection(
  blueprintEntity: BlueprintEntity,
  blueprintDirection: defines.direction,
  isFlipped: boolean,
): defines.direction {
  const value = blueprintEntity
  const valueName = value.name
  const type = getEntityType(valueName)!

  let entityDir = blueprintDirection

  if (type == "storage-tank") {
    if (isTwoDirectionTank(valueName)) {
      entityDir = (entityDir + (isFlipped ? 4 : 0)) % 8
    }
  } else if (type == "curved-rail-a" || type == "curved-rail-b") {
    const isDiagonal = (((value.direction ?? 0) / 2) % 2 == 1) != isFlipped
    if (isDiagonal) entityDir = (entityDir + 2) % 16
  } else {
    const isDiagonal = (value.direction ?? 0) % 4 == 2
    if (isDiagonal) {
      entityDir = (entityDir + (isFlipped ? 14 : 2)) % 16
    }
  }

  return entityDir
}

export interface FindPastedEntityParams {
  surface: LuaSurface
  position: MapPosition
  blueprintEntity: BlueprintEntity
  expectedDirection: defines.direction
  allowUpgrades: boolean
}

export interface FindPastedEntityResult {
  entity: LuaEntity | nil
  wasUpgraded: boolean
}

export function findPastedEntity(params: FindPastedEntityParams): FindPastedEntityResult {
  const { surface, position, blueprintEntity, expectedDirection, allowUpgrades } = params
  const referencedName = blueprintEntity.name
  const searchNames = allowUpgrades ? getCompatibleNames(referencedName) : referencedName

  if (searchNames == nil) return { entity: nil, wasUpgraded: false }

  const luaEntities = surface.find_entities_filtered({
    position,
    radius: 0,
    name: searchNames,
  })

  if (isEmpty(luaEntities)) return { entity: nil, wasUpgraded: false }

  const type = getEntityType(referencedName)!
  let luaEntity = luaEntities.find((e) => !e.supports_direction || e.direction == expectedDirection)

  if (type == "underground-belt") {
    const valueType = (blueprintEntity as UndergroundBeltBlueprintEntity).type ?? "input"
    if (luaEntity) {
      if (luaEntity.belt_to_ground_type != valueType) return { entity: nil, wasUpgraded: false }
    } else {
      const oppositeDir = oppositedirection(expectedDirection)
      luaEntity = luaEntities.find((e) => e.direction == oppositeDir && e.belt_to_ground_type != valueType)
    }
  }

  if (!luaEntity) {
    const pasteRotatableType = getPrototypeRotationType(referencedName)
    if (pasteRotatableType == RotationType.AnyDirection) {
      luaEntity = luaEntities[0]
    } else if (pasteRotatableType == RotationType.Flippable) {
      const oppositeDir = oppositedirection(expectedDirection)
      luaEntity = luaEntities.find((e) => e.direction == oppositeDir)
    }
  }

  const wasUpgraded = luaEntity != nil && luaEntity.name != referencedName
  return { entity: luaEntity, wasUpgraded }
}

export const BplibPasteEvent = DelayedEvent<nil>("bplibPaste", () => {
  flushPendingBplibPaste()
})

export function flushPendingBplibPaste(): void {
  const data = state.pendingBplibPaste
  if (!data) return
  state.pendingBplibPaste = nil

  processPendingBplibPaste(data)
}

function processPendingBplibPaste(data: BplibPasteData): void {
  const { stage, playerIndex, surface, entities, allowPasteUpgrades, flipVertical, flipHorizontal, direction } = data
  const isFlipped = flipVertical != flipHorizontal

  stage.project.content.batch(() => {
    for (const entityData of entities) {
      const { blueprintEntity, worldPosition } = entityData

      const rawDirection = blueprintEntity.direction ?? 0
      const rotatedDirection = ((rawDirection + direction) % 16) as defines.direction
      const cardinalDirection = floorToCardinalDirection(rotatedDirection)

      const entityDir = calculateTransformedDirection(blueprintEntity, cardinalDirection, isFlipped)

      const { entity: luaEntity } = findPastedEntity({
        surface,
        position: worldPosition,
        blueprintEntity,
        expectedDirection: entityDir,
        allowUpgrades: allowPasteUpgrades,
      })

      if (!luaEntity) continue

      const projectEntity = stage.actions.onEntityPossiblyUpdated(
        luaEntity,
        stage.stageNumber,
        nil,
        playerIndex,
        blueprintEntity.tags?.bp100 as StageInfoExport | nil,
        blueprintEntity.items,
      )

      let worldEntity: LuaEntity | nil = luaEntity
      if (!luaEntity.valid && projectEntity) {
        worldEntity = stage.project.worldPresentation.getWorldEntity(projectEntity, stage.stageNumber)
      }

      if (worldEntity?.valid) {
        stage.actions.onWiresPossiblyUpdated(worldEntity, stage.stageNumber, playerIndex)
      }
    }
  })
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

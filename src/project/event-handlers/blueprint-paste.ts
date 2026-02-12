import {
  BaseItemStack,
  BlueprintEntity,
  BlueprintWire,
  LuaEntity,
  LuaItemStack,
  LuaPlayer,
  LuaSurface,
  MapPosition,
  OnBuiltEntityEvent,
  OnPreBuildEvent,
  PlayerIndex,
  Tags,
  UndergroundBeltBlueprintEntity,
} from "factorio:runtime"
import { oppositedirection } from "util"
import { BlueprintBuild } from "__bplib__/blueprint"
import { Prototypes, Settings } from "../../constants"
import { LuaEntityInfo } from "../../entity/Entity"
import {
  getCompatibleNames,
  getEntityType,
  getPrototypeRotationType,
  isTwoDirectionTank,
  RotationType,
} from "../../entity/prototype-info"
import { StageInfoExport } from "../../import-export/entity"
import { isEmpty, PRecord, ProtectedEvents } from "../../lib"
import { DelayedEvent } from "../../lib/delayed-event"
import { floorToCardinalDirection, Pos } from "../../lib/geometry"
import { L_Interaction } from "../../locale"
import { Stage } from "../Project"
import { Migrations } from "../../lib/migration"
import { getState } from "./shared-state"

const Events = ProtectedEvents

const IsLastEntity = "bp100IsLastEntity"

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

interface BlueprintPasteState {
  toBeFastReplaced?: ToBeFastReplacedEntity

  currentBlueprintPaste?: {
    stage: Stage
    entities: BlueprintEntity[]
    knownLuaEntities: PRecord<number, LuaEntity>
    needsManualConnections: number[]
    originalNumEntities: number
    allowUpgrades: boolean
    flipVertical: boolean
    flipHorizontal: boolean
    direction: defines.direction
  }

  pendingBplibPaste?: BplibPasteData
}

let pasteState: BlueprintPasteState

declare const storage: {
  blueprintPasteState: BlueprintPasteState
}

Migrations.since("2.14.0", () => {
  pasteState = storage.blueprintPasteState ??= {}
})
Events.on_load(() => {
  pasteState = storage.blueprintPasteState
})

export function isInBlueprintPaste(): boolean {
  return pasteState.currentBlueprintPaste != nil
}

export function isInBplibPaste(): boolean {
  return pasteState.pendingBplibPaste != nil
}

export function clearCurrentBlueprintPaste(): void {
  pasteState.currentBlueprintPaste = nil
}

export function clearToBeFastReplaced(): void {
  const { toBeFastReplaced } = pasteState
  if (toBeFastReplaced) {
    const { stage } = toBeFastReplaced
    if (stage.valid) {
      const { stageNumber } = stage
      stage.actions.onEntityDeleted(toBeFastReplaced, stageNumber)
    }
    pasteState.toBeFastReplaced = nil
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
  pasteState.toBeFastReplaced = newValue
}

export function getToBeFastReplaced(): ToBeFastReplacedEntity | nil {
  return pasteState.toBeFastReplaced
}

export function clearToBeFastReplacedField(): void {
  pasteState.toBeFastReplaced = nil
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

  const normalizedPos = Pos.normalize(position)

  const type = getEntityType(referencedName)!
  let luaEntity =
    luaEntities.find(
      (e) => (!e.supports_direction || e.direction == expectedDirection) && Pos.equals(e.position, normalizedPos),
    ) ?? luaEntities.find((e) => !e.supports_direction || e.direction == expectedDirection)

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
  const data = pasteState.pendingBplibPaste
  if (!data) return
  pasteState.pendingBplibPaste = nil

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

interface MarkerTags extends Tags {
  referencedLuaIndex: number
  referencedName: string
}

export function getInnerBlueprint(stack: BaseItemStack | nil): LuaItemStack | nil {
  if (!stack || !stack.valid_for_read) return nil
  const type = stack.type
  if (type == "blueprint") return stack as LuaItemStack
  if (type == "blueprint-book") {
    const active = stack.active_index
    if (!active) return nil
    const innerStack = stack.get_inventory(defines.inventory.item_main)
    if (!innerStack) return nil
    return active <= innerStack.length ? getInnerBlueprint(innerStack[active - 1]) : nil
  }
  return nil
}

function blueprintNeedsPreparation(stack: LuaItemStack): boolean {
  return (
    stack.valid_for_read && stack.is_blueprint && stack.is_blueprint_setup() && stack.get_blueprint_entity_count() > 0
  )
}

function prepareBlueprintForStagePaste(stack: LuaItemStack): LuaMultiReturn<[BlueprintEntity[], number] | []> {
  if (!blueprintNeedsPreparation(stack)) return $multi()
  const entities = stack.get_blueprint_entities()
  if (!entities) return $multi()

  const numEntities = entities.length
  let nextIndex = numEntities + 1
  for (const i of $range(1, numEntities)) {
    const entity = entities[i - 1]
    const { direction } = entity
    const { name, position } = entity
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      direction,
      position,
      tags: {
        referencedName: name,
        referencedLuaIndex: i,
      } as MarkerTags,
    }
    nextIndex++
  }
  if (nextIndex == numEntities + 1) {
    entities[nextIndex - 1] = {
      entity_number: nextIndex,
      name: Prototypes.EntityMarker,
      position: { x: 0, y: 0 },
      tags: {},
    }
  }

  entities[entities.length - 1].tags![IsLastEntity] = true

  stack.set_blueprint_entities(entities)

  return $multi(entities, numEntities)
}

function revertPreparedBlueprint(stack: LuaItemStack): void {
  const current = assert(pasteState.currentBlueprintPaste)
  const entities = current.entities
  for (const i of $range(entities.length, current.originalNumEntities + 1, -1)) {
    entities[i - 1] = nil!
  }
  stack.set_blueprint_entities(entities)
}

function onPreBlueprintPastedBplib(player: LuaPlayer, stage: Stage, event: OnPreBuildEvent): void {
  flushPendingBplibPaste()

  const bpBuild = BlueprintBuild.new(event)
  if (!bpBuild) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }

  const blueprintEntities = bpBuild.get_entities()
  if (!blueprintEntities || blueprintEntities.length == 0) {
    return
  }

  const positionMap = bpBuild.map_blueprint_indices_to_world_positions()
  if (!positionMap) {
    return
  }

  const entities: BplibPasteEntityData[] = []
  for (const [index, position] of pairs(positionMap)) {
    const blueprintEntity = blueprintEntities[index - 1]
    if (!blueprintEntity) continue

    entities.push({
      blueprintEntity,
      worldPosition: position,
    })
  }

  if (entities.length == 0) return

  pasteState.pendingBplibPaste = {
    stage,
    playerIndex: player.index,
    surface: bpBuild.surface,
    entities,
    allowPasteUpgrades: event.build_mode == defines.build_mode.superforced,
    flipVertical: event.flip_vertical ?? false,
    flipHorizontal: event.flip_horizontal ?? false,
    direction: event.direction,
  } satisfies BplibPasteData

  BplibPasteEvent(nil)
}

export function onPreBlueprintPasted(
  player: LuaPlayer,
  stage: Stage | nil,
  event: OnPreBuildEvent,
  hasBlueprintSettingsPastedEvent: boolean,
): void {
  if (!stage) {
    tryFixBlueprint(player)
    return
  }
  if (hasBlueprintSettingsPastedEvent) {
    return
  }

  flushPendingBplibPaste()

  const useBplib = !!player.mod_settings[Settings.UseBplibForBlueprintPaste]?.value

  if (useBplib) {
    return onPreBlueprintPastedBplib(player, stage, event)
  }

  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }
  const [entities, numEntities] = prepareBlueprintForStagePaste(blueprint)
  if (entities != nil) {
    pasteState.currentBlueprintPaste = {
      stage,
      entities,
      knownLuaEntities: {},
      needsManualConnections: [],
      originalNumEntities: numEntities,
      allowUpgrades: event.build_mode == defines.build_mode.superforced,
      flipVertical: event.flip_vertical ?? false,
      flipHorizontal: event.flip_horizontal ?? false,
      direction: event.direction,
    }
  }
}

export function tryFixBlueprint(player: LuaPlayer): void {
  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) return
  const entityCount = blueprint.get_blueprint_entity_count()
  if (entityCount == 0) return
  const lastTags = blueprint.get_blueprint_entity_tag(entityCount, IsLastEntity)
  if (lastTags != nil) {
    const entities = blueprint.get_blueprint_entities()!
    blueprint.set_blueprint_entities(entities)
  }
}

Events.on_player_cursor_stack_changed((e) => {
  tryFixBlueprint(game.get_player(e.player_index)!)
  getState().lastPreBuild = nil
})

Events.on_player_changed_surface((e) => {
  tryFixBlueprint(game.get_player(e.player_index)!)
  getState().lastPreBuild = nil
})

export function onEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity): void {
  const tags = (e.tags ?? entity.tags) as MarkerTags
  if (tags != nil) {
    handleEntityMarkerBuilt(e, entity, tags)
    if (tags[IsLastEntity] != nil) onLastEntityMarkerBuilt(e)
  }
  entity.destroy()
}

function handleEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, tags: MarkerTags): void {
  const referencedName = tags.referencedName
  if (!referencedName) return

  const bpState = pasteState.currentBlueprintPaste!
  const entityId = tags.referencedLuaIndex
  const value = bpState.entities[entityId - 1]

  const isFlipped = bpState.flipVertical != bpState.flipHorizontal
  const entityDir = calculateTransformedDirection(value, entity.direction, isFlipped)

  let { entity: luaEntity } = findPastedEntity({
    surface: entity.surface,
    position: entity.position,
    blueprintEntity: value,
    expectedDirection: entityDir,
    allowUpgrades: bpState.allowUpgrades,
  })

  if (!luaEntity) return

  const stage = bpState.stage
  const projectEntity = stage.actions.onEntityPossiblyUpdated(
    luaEntity,
    stage.stageNumber,
    nil,
    e.player_index,
    value.tags?.bp100 as StageInfoExport | nil,
    value.items,
  )

  if (value.wires) {
    if (projectEntity != nil) {
      if (!luaEntity.valid) {
        luaEntity = stage.project.worldPresentation.getWorldEntity(projectEntity, stage.stageNumber)
        if (!luaEntity) return

        bpState.needsManualConnections.push(entityId)
      } else if (luaEntity.type == "transport-belt" || bpState.allowUpgrades) {
        bpState.needsManualConnections.push(entityId)
      } else {
        stage.actions.onWiresPossiblyUpdated(luaEntity, stage.stageNumber, e.player_index)
      }
    }
    bpState.knownLuaEntities[entityId] = luaEntity
  }
}

function onLastEntityMarkerBuilt(e: OnBuiltEntityEvent): void {
  const { entities, knownLuaEntities, needsManualConnections, stage } = pasteState.currentBlueprintPaste!

  for (const entityId of needsManualConnections) {
    const value = entities[entityId - 1]
    const luaEntity = knownLuaEntities[entityId]
    if (!luaEntity) continue
    manuallyConnectWires(value.wires, knownLuaEntities)
    stage.actions.onWiresPossiblyUpdated(luaEntity, stage.stageNumber, e.player_index)
  }

  const player = game.get_player(e.player_index)!

  const blueprint = getInnerBlueprint(player.cursor_stack)
  revertPreparedBlueprint(assert(blueprint))
  pasteState.currentBlueprintPaste = nil
}

function manuallyConnectWires(wires: BlueprintWire[] | nil, knownLuaEntities: PRecord<number, LuaEntity>): void {
  if (!wires) return
  for (const [fromNumber, fromId, toNumber, toId] of wires) {
    const fromEntity = knownLuaEntities[fromNumber]
    const toEntity = knownLuaEntities[toNumber]
    if (!fromEntity || !toEntity) continue
    fromEntity.get_wire_connector(fromId, true).connect_to(toEntity.get_wire_connector(toId, true))
  }
}

export function _resetBlueprintPasteState(): void {
  for (const [k] of pairs(pasteState)) {
    pasteState[k] = nil!
  }
}

export function _assertBlueprintPasteInValidState(): void {
  for (const [k, v] of pairs(pasteState)) {
    pasteState[k] = nil!
    assert(!v, `${k} was not cleaned up`)
  }
}

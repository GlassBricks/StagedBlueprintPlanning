/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BaseItemStack,
  BlueprintBookItemStack,
  BlueprintCircuitConnection,
  BlueprintConnectionData,
  BlueprintConnectionPoint,
  BlueprintEntity,
  BlueprintItemStack,
  CustomEventId,
  LuaEntity,
  LuaItemPrototype,
  LuaPlayer,
  LuaSurface,
  MapPosition,
  OnBuiltEntityEvent,
  OnPlayerAltSelectedAreaEvent,
  OnPlayerMinedEntityEvent,
  OnPlayerReverseSelectedAreaEvent,
  OnPlayerSelectedAreaEvent,
  OnPreBuildEvent,
  PlayerIndex,
  Tags,
} from "factorio:runtime"
import { oppositedirection } from "util"
import { CustomInputs, Prototypes, Settings } from "../constants"
import { BpStagedInfo } from "../copy-paste/blueprint-stage-info"
import { createBlueprintWithStageInfo } from "../copy-paste/create-blueprint-with-stage-info"
import { BobInserterChangedPositionEvent, DollyMovedEntityEvent } from "../declarations/mods"
import { LuaEntityInfo } from "../entity/Entity"
import {
  areUpgradeableTypes,
  EntityPrototypeInfo,
  getCompatibleNames,
  getPrototypeRotationType,
  isPreviewEntity,
  OnEntityPrototypesLoaded,
  RotationType,
} from "../entity/entity-prototype-info"
import { isWorldEntityProjectEntity } from "../entity/ProjectEntity"
import { assertNever, Mutable, mutableShallowCopy, PRecord, ProtectedEvents } from "../lib"
import { Pos } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { getProjectPlayerData } from "./player-project-data"
import { Stage } from "./ProjectDef"
import { getStageAtSurface } from "./stage-surface"
import {
  onUndoReferenceBuilt,
  registerGroupUndoAction,
  registerUndoAction,
  registerUndoActionLater,
  UndoAction,
} from "./undo"
import transform = Pos.applyTransformation

const Events = ProtectedEvents

function getStageAtEntity(entity: LuaEntity): Stage | nil {
  if (entity.valid && isWorldEntityProjectEntity(entity)) {
    return getStageAtSurface(entity.surface_index)
  }
}

function getStageAtEntityOrPreview(entity: LuaEntity): Stage | nil {
  if (entity.valid && (isWorldEntityProjectEntity(entity) || isPreviewEntity(entity))) {
    return getStageAtSurface(entity.surface_index)
  }
}

function luaEntityCreated(entity: LuaEntity, player: PlayerIndex | nil): void {
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

function luaEntityDeleted(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityDeleted(entity, stage.stageNumber, player)
}

function luaEntityPossiblyUpdated(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityPossiblyUpdated(entity, stage.stageNumber, nil, player)
}

function luaEntityMarkedForUpgrade(entity: LuaEntity, player: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityMarkedForUpgrade(entity, stage.stageNumber, player)
}

function luaEntityDied(entity: LuaEntity): void {
  const stage = getStageAtEntity(entity)
  if (stage) stage.actions.onEntityDied(entity, stage.stageNumber)
}

function luaEntityRotated(entity: LuaEntity, previousDirection: defines.direction, player: PlayerIndex | nil): void {
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

/*
Event order:

Mine:
  (on_pre_player_mined_item)
  on_player_mined_entity
  (on_player_mined_item)

Regular build:
  on_pre_build
  on_built_entity

Script raise:
  script_raised_built

Fast replace:
  on_pre_build
  (on_pre_player_mined_item)
  on_player_mined_entity
  (on_player_mined_item)
  on_built_entity

Underground fast replace:
  on_pre_build
  on_player_mined_entity, 1+x
  on_built_entity

Buggy Q-building:
  on_pre_build (with belt)
  on_player_cursor_stack_changed

Blueprinting:
  on_pre_build
  // (nothing else)

Deconstruct:
  script_raised_destroy

Upgrade:
  on_player_mined_entity (note: no on_pre_player_mined_item)
  on_built_entity

In editor mode:
Build:
  on_built_entity

Mine:
  <none>

Fast replace:
  (on_pre_player_mined_item)
  on_player_mined_entity
  (on_player_mined_item)
  on_built_entity

Event tree:
Start:
  on_player_mined_entity -> destroy
  on_pre_build: state = PreBuild
    (with blueprint in hand) -> blueprint
    on_built_entity -> build
    on_player_mined_entity:
      if is fast replace -> state = PossibleFastReplace
        on_built_entity -> fast replace or mine + build, state = Start
        on_player_mined_entity -> set underground pair, or destroy previous possibleFastReplace
      else -> destroy, stay in state (other entity)
  script_raised_built -> build
  script_raised_destroy -> destroy
  on_player_mined_entity:
    on_built_entity -> fast replace
  on_built_entity -> build
  on_player_changed_cursor, on_selected_entity_changed -> state = Start
*/

// simple:
const modName = script.mod_name
Events.script_raised_built((e) => {
  if (e.mod_name != modName) luaEntityCreated(e.entity, nil)
})
Events.on_robot_built_entity((e) => luaEntityCreated(e.created_entity, nil))
Events.script_raised_revive((e) => luaEntityCreated(e.entity, nil))

Events.script_raised_destroy((e) => {
  if (e.mod_name != modName) luaEntityDeleted(e.entity, nil)
})
Events.on_robot_mined_entity((e) => luaEntityDeleted(e.entity, nil))

Events.on_entity_died((e) => luaEntityDied(e.entity))

Events.on_entity_settings_pasted((e) => luaEntityPossiblyUpdated(e.destination, e.player_index))
Events.on_gui_closed((e) => {
  if (e.entity) luaEntityPossiblyUpdated(e.entity, e.player_index)
})
// Events.on_player_fast_transferred((e) => luaEntityPossiblyUpdated(e.entity, e.player_index))
Events.on_player_cursor_stack_changed((e) => {
  const player = game.get_player(e.player_index)!
  const stage = getStageAtSurface(player.surface_index)
  if (!stage) return
  const selected = player.selected
  if (selected && isWorldEntityProjectEntity(selected) && selected.get_module_inventory() != nil) {
    luaEntityPossiblyUpdated(selected, e.player_index)
  }
})

Events.on_player_rotated_entity((e) => luaEntityRotated(e.entity, e.previous_direction, e.player_index))

Events.on_marked_for_upgrade((e) => luaEntityMarkedForUpgrade(e.entity, e.player_index))

// building, mining, fast replacing: state machine

interface ToBeFastReplacedEntity extends LuaEntityInfo {
  readonly stage: Stage

  undergroundPair?: LuaEntity
  undergroundPairValue?: ToBeFastReplacedEntity
}
// in global, so no desync in case of bugs
let state: {
  lastPreBuild?: {
    event: OnPreBuildEvent
    item: string | nil
    surface: LuaSurface
  }
  toBeFastReplaced?: ToBeFastReplacedEntity

  preMinedItemCalled?: boolean

  currentBlueprintPaste?: {
    stage: Stage
    entities: BlueprintEntity[]
    knownLuaEntities: PRecord<number, LuaEntity>
    needsManualConnections: number[]
    originalNumEntities: number
    allowPasteUpgrades: boolean
    usedPasteUpgrade?: boolean
    isFlipped: boolean
    flipVertical: boolean
    flipHorizontal: boolean
    direction: defines.direction
  }

  accumulatedUndoActions?: UndoAction[]
}
declare global {
  interface PlayerData {
    lastWireAffectedEntity?: LuaEntity
  }
}
declare const global: GlobalWithPlayers & {
  worldListenerState: typeof state
}
Events.on_init(() => {
  state = global.worldListenerState = {}
})
Events.on_load(() => {
  state = global.worldListenerState
})

function clearToBeFastReplaced(player: PlayerIndex | nil): void {
  const { toBeFastReplaced } = state
  if (toBeFastReplaced) {
    const { stage } = toBeFastReplaced
    if (stage.valid) {
      const { stageNumber } = stage
      stage.actions.onEntityDeleted(toBeFastReplaced, stageNumber, player)
      const { undergroundPairValue } = toBeFastReplaced
      if (undergroundPairValue) {
        stage.actions.onEntityDeleted(undergroundPairValue, stageNumber, player)
      }
    }
    state.toBeFastReplaced = nil
  }
}

function setToBeFastReplaced(entity: LuaEntity, stage: Stage, player: PlayerIndex | nil): void {
  const isUnderground = entity.type == "underground-belt"
  const oldValue = state.toBeFastReplaced
  const newValue: ToBeFastReplacedEntity = {
    name: entity.name,
    type: entity.type,
    position: entity.position,
    direction: entity.direction,
    surface: entity.surface,
    belt_to_ground_type: isUnderground ? entity.belt_to_ground_type : nil,
    stage,
  }

  if (isUnderground) {
    if (oldValue && oldValue.undergroundPair == entity) {
      oldValue.undergroundPair = nil
      oldValue.undergroundPairValue = newValue
      return
    }
    // else, is the first underground belt
    newValue.undergroundPair = entity.neighbours as LuaEntity | nil
  }

  clearToBeFastReplaced(player)
  state.toBeFastReplaced = newValue
}

Events.on_pre_build((e) => {
  const player = game.get_player(e.player_index)!
  state.currentBlueprintPaste = nil

  const surface = player.surface
  if (player.is_cursor_blueprint()) {
    const stage = getStageAtSurface(surface.index)
    onPreBlueprintPasted(player, stage, e)
    return
  }

  let item: LuaItemPrototype | nil
  const cursorStack = player.cursor_stack
  if (cursorStack && cursorStack.valid_for_read) {
    item = cursorStack.prototype
  } else {
    item = player.cursor_ghost
  }
  if (!item) return
  state.lastPreBuild = {
    surface,
    item: item.name,
    event: e,
  }
  clearToBeFastReplaced(e.player_index)

  // handle underground rotation via drag, very manually

  if (!e.created_by_moving) return
  const stage = getStageAtSurface(surface.index)
  if (!stage) return
  const placeResult = item.place_result
  if (!placeResult || placeResult.type != "transport-belt") return
  const hoveredEntity = surface.find_entities_filtered({
    position: e.position,
    radius: 0,
    type: "underground-belt",
    direction: oppositedirection(e.direction),
    limit: 1,
  })[0]
  if (hoveredEntity != nil) {
    stage.actions.onUndergroundBeltDragRotated(hoveredEntity, stage.stageNumber, e.player_index)
  }
})

Events.on_pre_player_mined_item(() => {
  state.preMinedItemCalled = true
})

function isFastReplaceCompatible(
  pos1: MapPosition,
  pos2: MapPosition,
  item1: string,
  item2: string,
  direction1: defines.direction,
  direction2: defines.direction,
): boolean {
  return (
    pos1.x == pos2.x &&
    pos1.y == pos2.y &&
    ((item1 == item2 && direction1 != direction2) || (item1 != item2 && areUpgradeableTypes(item1, item2)))
  )
}
function isFastReplaceMine(mineEvent: OnPlayerMinedEntityEvent) {
  const lastPreBuild = state.lastPreBuild
  if (!lastPreBuild) return

  const { entity } = mineEvent
  const toBeFastReplaced = state.toBeFastReplaced
  if (toBeFastReplaced && toBeFastReplaced.undergroundPair == entity) {
    return true
  }

  const { event, item } = lastPreBuild

  if (
    item == nil ||
    event.tick != mineEvent.tick ||
    event.player_index != mineEvent.player_index ||
    entity.surface != lastPreBuild.surface
  )
    return

  const { position } = event
  if (isFastReplaceCompatible(position, entity.position, item, entity.name, event.direction, entity.direction)) {
    return true
  }
  if (entity.type == "underground-belt") {
    const pair = entity.neighbours as LuaEntity | nil
    if (pair && isFastReplaceCompatible(position, pair.position, item, pair.name, event.direction, pair.direction)) {
      return true
    }
  }
}

Events.on_player_mined_entity((e) => {
  const { entity } = e

  const preMinedItemCalled = state.preMinedItemCalled
  state.preMinedItemCalled = nil
  const entitySurface = entity.surface
  const stage = getStageAtSurface(entitySurface.index)
  if (!stage || !isWorldEntityProjectEntity(entity)) return

  if (preMinedItemCalled == nil || isFastReplaceMine(e)) {
    // this happens when using instant upgrade planner
    setToBeFastReplaced(entity, stage, e.player_index)
  } else {
    stage.actions.onEntityDeleted(entity, stage.stageNumber, e.player_index)
  }
})

Events.on_built_entity((e) => {
  const { created_entity: entity } = e
  if (!entity.valid) return

  const innerName = getInnerName(entity)
  if (innerName == Prototypes.UndoReference) {
    return onUndoReferenceBuilt(e.player_index, entity)
  }

  const currentBlueprintPaste = state.currentBlueprintPaste
  if (currentBlueprintPaste) {
    if (innerName == Prototypes.EntityMarker) onEntityMarkerBuilt(e, entity)
    return
  }
  // just in case
  if (innerName == Prototypes.EntityMarker) {
    entity.destroy()
    return
  }

  const lastPreBuild = state.lastPreBuild
  state.lastPreBuild = nil

  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return

  const playerIndex = e.player_index

  if (!isWorldEntityProjectEntity(entity)) {
    return
  }

  // also handles instant upgrade planner
  if (tryFastReplace(entity, stage, playerIndex)) return

  if (lastPreBuild == nil) {
    // editor mode build, marker entity, or multiple-entities in one build
    stage.actions.onEntityCreated(entity, stage.stageNumber, playerIndex)
    return
  }
  // finally, normal build
  const undoAction = stage.actions.onEntityCreated(entity, stage.stageNumber, playerIndex)
  if (undoAction) {
    registerUndoActionLater(undoAction)
  }
})

function tryFastReplace(entity: LuaEntity, stage: Stage, player: PlayerIndex) {
  const { toBeFastReplaced } = state
  if (!toBeFastReplaced) return

  const undergroundPairValue = toBeFastReplaced.undergroundPairValue

  if (isFastReplaceable(toBeFastReplaced, entity)) {
    stage.actions.onEntityPossiblyUpdated(entity, stage.stageNumber, toBeFastReplaced.direction, player)
    state.toBeFastReplaced = undergroundPairValue // could be nil
    return true
  }
  // check the underground pair value instead
  if (undergroundPairValue && isFastReplaceable(undergroundPairValue, entity)) {
    stage.actions.onEntityPossiblyUpdated(entity, stage.stageNumber, toBeFastReplaced.direction, player)
    toBeFastReplaced.undergroundPairValue = nil
    return true
  }
  // not fast replaceable, call delete on the stored value
  clearToBeFastReplaced(player)
}

function isFastReplaceable(old: LuaEntityInfo, next: LuaEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && areUpgradeableTypes(old.name, next.name)
}

// Blueprinting
// There is no event to detect if blueprint entities are _updated_; instead we use the following strategy:
// When a blueprint is about to be pasted in a stage, we modify it to add entity markers at every entity
// When the entity markers are pasted, the corresponding entity is updated
// The blueprint is reverted after the paste, when the last entity marker is pasted

const IsLastEntity = "bp100IsLastEntity"

interface MarkerTags extends Tags {
  referencedLuaIndex: number
  referencedName: string
}

function getInnerBlueprint(stack: BaseItemStack | nil): BlueprintItemStack | nil {
  if (!stack || !stack.valid_for_read) return nil
  const type = stack.type
  if (type == "blueprint") return stack as BlueprintItemStack
  if (type == "blueprint-book") {
    const active = (stack as BlueprintBookItemStack).active_index
    if (!active) return nil
    const innerStack = stack.get_inventory(defines.inventory.item_main)
    if (!innerStack) return nil
    return active <= innerStack.length ? getInnerBlueprint(innerStack[active - 1]) : nil
  }
  return nil
}

function blueprintNeedsPreparation(stack: BlueprintItemStack): boolean {
  return (
    stack.valid_for_read && stack.is_blueprint && stack.is_blueprint_setup() && stack.get_blueprint_entity_count() > 0
  )
}

function fixOldBlueprint(entities: BlueprintEntity[]): void {
  // old blueprint, remove old markers
  const firstEntityMarker = entities.findIndex((e) => e.name == Prototypes.EntityMarker)
  // remove all entities after the first entity marker
  for (const i of $range(firstEntityMarker + 1, entities.length)) {
    entities[i - 1] = nil!
  }
}

/**
 * Returns entities and original num entities if successful, nil otherwise
 * @param stack
 */
function prepareBlueprintForStagePaste(stack: BlueprintItemStack): LuaMultiReturn<[BlueprintEntity[], number] | []> {
  if (!blueprintNeedsPreparation(stack)) return $multi()
  const entities = stack.get_blueprint_entities()
  if (!entities) return $multi()

  if (stack.cost_to_build[Prototypes.EntityMarker] != nil) fixOldBlueprint(entities)

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
    // add one anyway
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

function revertPreparedBlueprint(stack: BlueprintItemStack): void {
  const current = assert(state.currentBlueprintPaste)
  const entities = current.entities
  for (const i of $range(entities.length, current.originalNumEntities + 1, -1)) {
    entities[i - 1] = nil!
  }
  stack.set_blueprint_entities(entities)
}

function onPreBlueprintPasted(player: LuaPlayer, stage: Stage | nil, event: OnPreBuildEvent): void {
  if (!stage) {
    tryFixBlueprint(player)
    return
  }
  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) {
    player.print([L_Interaction.BlueprintNotHandled])
    return
  }
  const [entities, numEntities] = prepareBlueprintForStagePaste(blueprint)
  if (entities != nil) {
    state.currentBlueprintPaste = {
      stage,
      entities,
      knownLuaEntities: {},
      needsManualConnections: [],
      originalNumEntities: numEntities,
      allowPasteUpgrades: player.mod_settings[Settings.UpgradeOnPaste].value as boolean,
      isFlipped: event.flip_vertical != event.flip_horizontal,
      flipVertical: event.flip_vertical ?? false,
      flipHorizontal: event.flip_horizontal ?? false,
      direction: event.direction,
    }
  }
}

function tryFixBlueprint(player: LuaPlayer): void {
  const blueprint = getInnerBlueprint(player.cursor_stack)
  if (!blueprint) return
  const entityCount = blueprint.get_blueprint_entity_count()
  if (entityCount == 0) return
  const lastTags = blueprint.get_blueprint_entity_tag(entityCount, IsLastEntity)
  if (lastTags != nil) {
    const entities = blueprint.get_blueprint_entities()!
    fixOldBlueprint(entities)
    blueprint.set_blueprint_entities(entities)
  }
}

Events.on_player_cursor_stack_changed((e) => {
  tryFixBlueprint(game.get_player(e.player_index)!)
  state.lastPreBuild = nil
})

Events.on_player_changed_surface((e) => {
  tryFixBlueprint(game.get_player(e.player_index)!)
  state.lastPreBuild = nil
})

function getInnerName(entity: LuaEntity): string {
  if (entity.type == "entity-ghost") return entity.ghost_name
  return entity.name
}
function onEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity): void {
  const tags = (e.tags ?? entity.tags) as MarkerTags
  if (tags != nil) {
    handleEntityMarkerBuilt(e, entity, tags)
    if (tags[IsLastEntity] != nil) onLastEntityMarkerBuilt(e)
  }
  entity.destroy()
}

function manuallyConnectWires(
  luaEntity: LuaEntity,
  connections: BlueprintConnectionData[] | nil,
  sourceId: number,
  wireType: defines.wire_type,
) {
  if (!connections) return
  const knownLuaEntities = state.currentBlueprintPaste!.knownLuaEntities
  for (const { entity_id: otherId, circuit_id } of connections) {
    const otherEntity = knownLuaEntities[otherId]
    if (!otherEntity || !otherEntity.valid) continue
    luaEntity.connect_neighbour({
      wire: wireType,
      target_entity: otherEntity,
      source_circuit_id: sourceId,
      target_circuit_id: circuit_id ?? 1,
    })
  }
}

function manuallyConnectPoint(luaEntity: LuaEntity, connection: BlueprintConnectionPoint | nil, sourceId: number) {
  if (!connection) return
  manuallyConnectWires(luaEntity, connection.red, sourceId, defines.wire_type.red)
  manuallyConnectWires(luaEntity, connection.green, sourceId, defines.wire_type.green)
}

function manuallyConnectCircuits(luaEntity: LuaEntity, connections: BlueprintCircuitConnection | nil) {
  if (!connections) return
  manuallyConnectPoint(luaEntity, connections["1"], 1)
  manuallyConnectPoint(luaEntity, connections["2"], 2)
}

function manuallyConnectNeighbours(luaEntity: LuaEntity, connections: number[] | nil) {
  if (!connections || luaEntity.type != "electric-pole") return
  const knownLuaEntities = state.currentBlueprintPaste!.knownLuaEntities
  for (const otherId of connections) {
    const otherEntity = knownLuaEntities[otherId]
    if (!otherEntity || otherEntity.type != "electric-pole") continue
    luaEntity.connect_neighbour(otherEntity)
  }
}

let nameToType: EntityPrototypeInfo["nameToType"]
let twoDirectionTanks: EntityPrototypeInfo["twoDirectionTanks"]
OnEntityPrototypesLoaded.addListener((e) => {
  nameToType = e.nameToType
  twoDirectionTanks = e.twoDirectionTanks
})

const rawset = _G.rawset

function flipSplitterPriority(entity: Mutable<BlueprintEntity>) {
  if (entity.input_priority) {
    entity.input_priority = entity.input_priority == "left" ? "right" : "left"
  }
  if (entity.output_priority) {
    entity.output_priority = entity.output_priority == "left" ? "right" : "left"
  }
}
function editPassedValue(entity: BlueprintEntity, edit: (entity: Mutable<BlueprintEntity>) => void): BlueprintEntity {
  const passedValue = mutableShallowCopy(entity)
  assume<Mutable<BlueprintEntity>>(passedValue)
  const stageInfoTags = passedValue.tags?.bp100 as BpStagedInfo | nil
  if (!stageInfoTags?.firstValue) {
    edit(passedValue)
  } else {
    edit(stageInfoTags.firstValue as Mutable<BlueprintEntity>)
    if (stageInfoTags?.stageDiffs) {
      for (const [, value] of pairs(stageInfoTags.stageDiffs)) {
        edit(value as Mutable<BlueprintEntity>)
      }
    }
  }
  return passedValue
}

function handleEntityMarkerBuilt(e: OnBuiltEntityEvent, entity: LuaEntity, tags: MarkerTags): void {
  const referencedName = tags.referencedName
  if (!referencedName) return

  const bpState = state.currentBlueprintPaste!

  const { position, surface } = entity
  let luaEntities = entity.surface.find_entities_filtered({
    position,
    radius: 0,
    name: referencedName,
  })
  let usedPasteUpgrade = false
  if (!next(luaEntities)[0]) {
    if (!bpState.allowPasteUpgrades) return
    const compatible = getCompatibleNames(referencedName)
    if (!compatible) return
    luaEntities = surface.find_entities_filtered({
      position,
      radius: 0,
      name: compatible,
    })
    if (!next(luaEntities)[0]) return
    usedPasteUpgrade = true
  }

  const entityId = tags.referencedLuaIndex
  const value = bpState.entities[entityId - 1]
  let passedValue: BlueprintEntity = value

  let entityDir = entity.direction

  const valueName = value.name
  const type = nameToType.get(valueName)!
  if (type == "storage-tank") {
    if (twoDirectionTanks.has(valueName)) {
      entityDir = (entityDir + (bpState.isFlipped ? 2 : 0)) % 4
    }
  } else if (type == "curved-rail") {
    const isDiagonal = ((value.direction ?? 0) % 2 == 1) != bpState.isFlipped
    if (isDiagonal) entityDir = (entityDir + 1) % 8
  } else if (type == "splitter") {
    if (bpState.isFlipped) {
      passedValue = editPassedValue(value, flipSplitterPriority)
    }
  } else if (type == "inserter") {
    if (passedValue.pickup_position || passedValue.drop_position) {
      passedValue = editPassedValue(value, (inserter) => {
        if (inserter.pickup_position) {
          inserter.pickup_position = transform(
            inserter.pickup_position,
            bpState.flipHorizontal,
            bpState.flipVertical,
            bpState.direction,
          )
        }
        if (inserter.drop_position) {
          inserter.drop_position = transform(
            inserter.drop_position,
            bpState.flipHorizontal,
            bpState.flipVertical,
            bpState.direction,
          )
        }
      })
    }
  } else {
    const isDiagonal = (value.direction ?? 0) % 2 == 1
    if (isDiagonal) {
      entityDir = (entityDir + (bpState.isFlipped ? 7 : 1)) % 8
    }
  }

  let luaEntity = luaEntities.find((e) => !e.supports_direction || e.direction == entityDir)
  if (type == "underground-belt") {
    const valueType = value.type ?? "input"
    if (luaEntity) {
      // make sure is also correct belt_to_ground_type, else would match opposite direction
      if (luaEntity.belt_to_ground_type != valueType) return
    } else {
      // entity not found, check for opposite type and opposite direction
      entityDir = oppositedirection(entityDir)
      luaEntity = luaEntities.find((e) => e.direction == entityDir && e.belt_to_ground_type != valueType)
    }
    if (!luaEntity) return
  } else if (!luaEntity) {
    // slower path, check for other directions
    const pasteRotatableType = getPrototypeRotationType(referencedName)
    if (pasteRotatableType == nil) return
    if (pasteRotatableType == RotationType.AnyDirection) {
      luaEntity = luaEntities[0]
    } else if (pasteRotatableType == RotationType.Flippable) {
      const oppositeDir = oppositedirection(entityDir)
      luaEntity = luaEntities.find((e) => e.direction == oppositeDir)
    } else {
      assertNever(pasteRotatableType)
    }
    if (!luaEntity) return
  }

  // performance hack: cache name, type
  rawset(luaEntity, "name", luaEntity.name)
  rawset(luaEntity, "type", type)

  if (usedPasteUpgrade) {
    bpState.usedPasteUpgrade = true
  }

  const stage = bpState.stage
  const projectEntity = stage.actions.onEntityPossiblyUpdated(
    luaEntity,
    stage.stageNumber,
    nil,
    e.player_index,
    passedValue,
  )

  const { neighbours, connections } = value
  if (!neighbours && !connections) return

  if (projectEntity != nil) {
    // check for circuit wires
    if (!luaEntity.valid) {
      // must have been upgraded
      luaEntity = projectEntity.getWorldEntity(stage.stageNumber)
      if (!luaEntity) return

      bpState.needsManualConnections.push(entityId)
    } else if (luaEntity.type == "transport-belt") {
      // factorio bug? transport belts don't save circuit connections immediately when pasted
      bpState.needsManualConnections.push(entityId)
    } else {
      stage.actions.onWiresPossiblyUpdated(luaEntity, stage.stageNumber, e.player_index)
    }
  }

  bpState.knownLuaEntities[entityId] = luaEntity // save the entity if it has wire-connections
}

function onLastEntityMarkerBuilt(e: OnBuiltEntityEvent): void {
  const { entities, knownLuaEntities, needsManualConnections, usedPasteUpgrade, stage } = state.currentBlueprintPaste!

  for (const entityId of needsManualConnections) {
    const value = entities[entityId - 1]
    const luaEntity = knownLuaEntities[entityId]
    if (!luaEntity) continue
    manuallyConnectNeighbours(luaEntity, value.neighbours)
    manuallyConnectCircuits(luaEntity, value.connections)
    stage.actions.onWiresPossiblyUpdated(luaEntity, stage.stageNumber, e.player_index)
  }

  const player = game.get_player(e.player_index)!

  if (usedPasteUpgrade) {
    player.print([L_Interaction.PasteUpgradeApplied])
  }

  const blueprint = getInnerBlueprint(player.cursor_stack)
  revertPreparedBlueprint(assert(blueprint))
  state.currentBlueprintPaste = nil
}

// Circuit wires and cables
// There is no event for this, so we listen to player inputs to detect potential changes, and check during on_selected_entity_changed

function markPlayerAffectedWires(player: LuaPlayer): void {
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntity(entity)
  if (!stage) return

  const data = global.players[player.index]
  const existingEntity = data.lastWireAffectedEntity
  if (existingEntity && existingEntity != entity) {
    stage.actions.onWiresPossiblyUpdated(entity, stage.stageNumber, player.index)
  }
  data.lastWireAffectedEntity = entity
}

function clearPlayerAffectedWires(index: PlayerIndex): void {
  const data = global.players[index]
  const entity = data.lastWireAffectedEntity
  if (entity) {
    data.lastWireAffectedEntity = nil
    const stage = getStageAtEntity(entity)
    if (stage) stage.actions.onWiresPossiblyUpdated(entity, stage.stageNumber, index)
  }
}

const wirePrototypes = newLuaSet("red-wire", "green-wire", "copper-cable")
Events.on(CustomInputs.Build, (e) => {
  const player = game.get_player(e.player_index)!
  const playerStack = player.cursor_stack
  if (!playerStack || !playerStack.valid_for_read || !wirePrototypes.has(playerStack.name)) return
  markPlayerAffectedWires(player)
})
Events.on(CustomInputs.RemovePoleCables, (e) => {
  markPlayerAffectedWires(game.get_player(e.player_index)!)
})
Events.on_selected_entity_changed((e) => {
  clearPlayerAffectedWires(e.player_index)
  state.lastPreBuild = nil
})

// Cleanup tool

function checkCleanupTool(e: OnPlayerSelectedAreaEvent): void {
  if (e.item != Prototypes.CleanupTool) return
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const updateLater: LuaEntity[] = []
  const { stageNumber } = stage
  const onCleanupToolUsed = stage.actions.onCleanupToolUsed
  for (const entity of e.entities) {
    if (entity.train) {
      updateLater.push(entity)
    } else {
      onCleanupToolUsed(entity, stageNumber)
    }
  }
  for (const entity of updateLater) {
    onCleanupToolUsed(entity, stageNumber)
  }
}
function checkCleanupToolReverse(e: OnPlayerSelectedAreaEvent): void {
  if (e.item != Prototypes.CleanupTool) return
  const playerIndex = e.player_index
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const onEntityForceDeleteUsed = stage.actions.onEntityForceDeleteUsed
  const stageNumber = stage.stageNumber
  const undoActions: UndoAction[] = []
  for (const entity of e.entities) {
    const undoAction = onEntityForceDeleteUsed(entity, stageNumber, playerIndex)
    if (undoAction) undoActions.push(undoAction)
  }
  registerGroupUndoAction(undoActions)
}

Events.onAll({
  on_player_selected_area: checkCleanupTool,
  on_player_alt_selected_area: checkCleanupTool,
  on_player_reverse_selected_area: checkCleanupToolReverse,
})

// Custom inputs

Events.on(CustomInputs.ForceDelete, (e) => {
  const playerIndex = e.player_index
  const player = game.get_player(playerIndex)!
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntityOrPreview(entity)
  if (!stage) return
  const { name, position } = entity
  const undoAction = stage.actions.onEntityForceDeleteUsed(entity, stage.stageNumber, playerIndex)
  if (undoAction) {
    player.play_sound({ path: "entity-mined/" + name, position })
    registerUndoAction(undoAction)
  }
})

Events.on(CustomInputs.MoveToThisStage, (e) => {
  const player = game.get_player(e.player_index)!
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntityOrPreview(entity)
  if (!stage) {
    // should this be in project-actions.ts instead?
    player.create_local_flying_text({
      text: [L_Interaction.NotInAnProject],
      create_at_cursor: true,
    })
    return
  }

  const undoAction = stage.actions.onMoveEntityToStageCustomInput(entity, stage.stageNumber, e.player_index)
  if (undoAction) registerUndoAction(undoAction)
})

// Stage move tool, stage deconstruct tool

function stageMoveToolUsed(e: OnPlayerSelectedAreaEvent): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const playerIndex = e.player_index
  const playerData = getProjectPlayerData(playerIndex, stage.project)
  if (!playerData) return
  const targetStage = playerData.moveTargetStage
  if (!targetStage) {
    error("moveTargetStage was not set")
  }
  const { stageNumber } = stage
  const undoActions: UndoAction[] = []
  const onSendToStageUsed = stage.actions.onSendToStageUsed
  for (const entity of e.entities) {
    const undoAction = onSendToStageUsed(entity, stageNumber, targetStage, playerIndex)
    if (undoAction) undoActions.push(undoAction)
  }
  registerGroupUndoAction(undoActions)
}

function selectionToolUsed(
  e: OnPlayerSelectedAreaEvent | OnPlayerAltSelectedAreaEvent | OnPlayerReverseSelectedAreaEvent,
  action: "onStageDeleteUsed" | "onStageDeleteCancelUsed" | "onBringToStageUsed" | "onBringDownToStageUsed",
): void {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return

  const { stageNumber } = stage
  const undoActions: UndoAction[] = []
  const fn = stage.actions[action]
  const playerIndex = e.player_index
  for (const entity of e.entities) {
    const undoAction = fn(entity, stageNumber, playerIndex)
    if (undoAction) undoActions.push(undoAction)
  }

  registerGroupUndoAction(undoActions)
}

// staged copy, cut
function stagedCopyToolUsed(event: OnPlayerSelectedAreaEvent): void {
  const player = game.get_player(event.player_index)!
  const stage = getStageAtSurface(event.surface.index)
  if (!stage) {
    return player.print([L_Interaction.NotInAnProject])
  }
  createBlueprintWithStageInfo(player, stage, event.area)
}

Events.on_player_selected_area((e) => {
  const item = e.item
  if (item == Prototypes.StageMoveTool) {
    stageMoveToolUsed(e)
  } else if (item == Prototypes.StageDeconstructTool) {
    selectionToolUsed(e, "onStageDeleteUsed")
  } else if (item == Prototypes.StagedCopyTool) {
    stagedCopyToolUsed(e)
  }
})

Events.on_player_alt_selected_area((e) => {
  if (e.item == Prototypes.StageMoveTool) {
    selectionToolUsed(e, "onBringToStageUsed")
  } else if (e.item == Prototypes.StageDeconstructTool) {
    selectionToolUsed(e, "onStageDeleteCancelUsed")
  }
})
Events.on_player_reverse_selected_area((e) => {
  if (e.item == Prototypes.StageMoveTool) {
    selectionToolUsed(e, "onBringToStageUsed")
  }
})

Events.on_player_alt_reverse_selected_area((e) => {
  if (e.item == Prototypes.StageMoveTool) {
    selectionToolUsed(e, "onBringDownToStageUsed")
  }
})

// Filtered stage move tool
Events.on_marked_for_deconstruction((e) => {
  const playerIndex = e.player_index
  if (!playerIndex) return
  const player = game.get_player(playerIndex)!
  const cursorStack = player.cursor_stack
  if (!cursorStack || !cursorStack.valid_for_read || cursorStack.name != Prototypes.FilteredStageMoveTool) return

  const entity = e.entity
  entity.cancel_deconstruction(entity.force)
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return
  const playerData = getProjectPlayerData(playerIndex, stage.project)
  if (!playerData) return
  const targetStage = playerData.moveTargetStage
  if (!targetStage) return
  const undoAction = stage.actions.onSendToStageUsed(entity, stage.stageNumber, targetStage, playerIndex)
  if (undoAction) {
    ;(state.accumulatedUndoActions ??= []).push(undoAction)
  }
})

Events.on_player_deconstructed_area((e) => {
  if (e.item != Prototypes.FilteredStageMoveTool) return
  const player = game.get_player(e.player_index)!
  if (getStageAtSurface(player.surface_index) == nil) {
    player.create_local_flying_text({
      text: [L_Interaction.NotInAnProject],
      create_at_cursor: true,
    })
    player.play_sound({ path: "utility/cannot_build" })
    return
  }
  const undoActions = state.accumulatedUndoActions
  if (undoActions) {
    registerGroupUndoAction(undoActions)
    delete state.accumulatedUndoActions
  }
})

// Generated chunks
Events.on_chunk_generated((e) => {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const entities = e.surface.find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
    area: e.area,
  })
  const { stageNumber, project } = stage

  const onTryFixEntity = stage.actions.onTryFixEntity
  for (const entity of entities) {
    if (entity.valid) onTryFixEntity(entity, stageNumber)
  }

  const status = defines.chunk_generated_status.entities
  for (const { surface } of project.getAllStages()) {
    const position = e.position
    if (!surface.is_chunk_generated(position)) {
      if (surface.generate_with_lab_tiles) {
        surface.build_checkerboard(e.area)
      } else {
        surface.request_to_generate_chunks(position, 1)
        surface.force_generate_chunk_requests()
      }
      surface.set_chunk_generated_status(position, status)
    }
  }
})

// Mod support

// PickerDollies
if (remote.interfaces.PickerDollies && remote.interfaces.PickerDollies.dolly_moved_entity_id) {
  Events.onInitOrLoad(() => {
    const event = remote.call("PickerDollies", "dolly_moved_entity_id") as CustomEventId<DollyMovedEntityEvent>
    Events.on(event, (e) => {
      const stage = getStageAtEntityOrPreview(e.moved_entity)
      if (stage) {
        stage.project.actions.onEntityDollied(e.moved_entity, stage.stageNumber, e.start_pos, e.player_index)
      }
    })
  })
}

// bob inserters
Events.onInitOrLoad(() => {
  for (const mod of ["bobinserters", "boblogistics"]) {
    if (mod in remote.interfaces) {
      const eventId = remote.call(
        mod,
        "get_changed_position_event_id",
      ) as CustomEventId<BobInserterChangedPositionEvent>
      Events.on(eventId, (e) => luaEntityPossiblyUpdated(e.entity, nil))
    }
  }
})

/**
 * For manual calls from other parts of the code
 */
export const checkForEntityUpdates = luaEntityPossiblyUpdated
export function checkForCircuitWireUpdates(entity: LuaEntity, byPlayer: PlayerIndex | nil): void {
  const stage = getStageAtEntity(entity)
  if (stage) {
    stage.actions.onWiresPossiblyUpdated(entity, stage.stageNumber, byPlayer)
  }
}

// debug
export const _assertInValidState = (): void => {
  state.lastPreBuild = nil // can be set
  for (const [k, v] of pairs(state)) {
    state[k] = nil!
    assert(!v, `${k} was not cleaned up`)
  }
}

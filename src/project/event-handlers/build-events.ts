import { BlueprintInsertPlan, LuaEntity, MapPosition, OnPlayerMinedEntityEvent, PlayerIndex } from "factorio:runtime"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { LuaEntityInfo } from "../../entity/Entity"
import { isWorldEntityProjectEntity } from "../../entity/ProjectEntity"
import { areUpgradeableTypes } from "../../entity/prototype-info"
import { StageInfoExport } from "../../import-export/entity"
import { ProtectedEvents } from "../../lib"
import { Pos } from "../../lib/geometry"
import { Stage } from "../Project"
import { onUndoReferenceBuilt, registerUndoActionLater } from "../actions/undo"
import { getStageAtSurface } from "../project-refs"
import {
  clearToBeFastReplaced,
  clearToBeFastReplacedField,
  getPasteItemRequests,
  getToBeFastReplaced,
  onPreBlueprintPasteNative,
  setToBeFastReplaced,
} from "./blueprint-paste"
import { getInnerName, getState } from "./shared-state"

const Events = ProtectedEvents

// Applies a blueprint-pasted entity to the project: updates/adds it, then saves any wire
// connections the paste made.
function applyPastedEntity(
  stage: Stage,
  entity: LuaEntity,
  previousDirection: defines.direction | nil,
  player: PlayerIndex | nil,
  stagedInfo: StageInfoExport | nil,
  items: BlueprintInsertPlan[] | nil,
): void {
  const projectEntity = stage.actions.onEntityPossiblyUpdated(
    entity,
    stage.stageNumber,
    previousDirection,
    player,
    stagedInfo,
    items,
  )
  let worldEntity: LuaEntity | nil = entity
  if (!entity.valid && projectEntity) {
    worldEntity = stage.project.worldPresentation.getWorldEntity(projectEntity, stage.stageNumber)
  }
  if (worldEntity?.valid) {
    stage.actions.onWiresPossiblyUpdated(worldEntity, stage.stageNumber, player)
  }
}

Events.on_blueprint_settings_pasted((event) => {
  const entity = event.entity
  if (!entity.valid || !isWorldEntityProjectEntity(entity)) return
  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return
  const stagedInfo = event.tags?.bp100 as StageInfoExport | nil
  const items = getPasteItemRequests(event.tags)
  applyPastedEntity(stage, entity, event.previous_direction, event.player_index, stagedInfo, items)
})

Events.on_pre_build((e) => {
  const player = game.get_player(e.player_index)!

  const surface = player.surface
  if (player.is_cursor_blueprint()) {
    const stage = getStageAtSurface(surface.index)
    onPreBlueprintPasteNative(player, stage)
    return
  }

  let item: import("factorio:runtime").LuaItemPrototype | nil
  const cursorStack = player.cursor_stack
  if (cursorStack && cursorStack.valid_for_read) {
    item = cursorStack.prototype
  } else {
    item = player.cursor_ghost?.name
  }
  if (!item) return
  getState().lastPreBuild = {
    surface,
    item: item.name,
    event: e,
  }
  clearToBeFastReplaced()

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
  getState().preMinedItemCalled = true
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

function isFastReplaceMine(mineEvent: OnPlayerMinedEntityEvent): boolean | nil {
  const lastPreBuild = getState().lastPreBuild
  if (!lastPreBuild) return

  const { entity } = mineEvent

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
    const pair = entity.underground_belt_neighbour
    if (pair && isFastReplaceCompatible(position, pair.position, item, pair.name, event.direction, pair.direction)) {
      return true
    }
  }
}

Events.on_player_mined_entity((e) => {
  const { entity } = e

  const preMinedItemCalled = getState().preMinedItemCalled
  getState().preMinedItemCalled = nil
  const entitySurface = entity.surface
  const stage = getStageAtSurface(entitySurface.index)
  if (!stage || !isWorldEntityProjectEntity(entity)) return

  if (preMinedItemCalled == nil || isFastReplaceMine(e)) {
    setToBeFastReplaced(entity, stage)
  } else {
    stage.actions.onEntityDeleted(entity, stage.stageNumber)
  }
})

Events.on_built_entity((e) => {
  const { entity } = e
  if (!entity.valid) return

  const innerName = getInnerName(entity)
  if (innerName == Prototypes.UndoReference) {
    return onUndoReferenceBuilt(e.player_index, entity)
  }

  const lastPreBuild = getState().lastPreBuild
  getState().lastPreBuild = nil

  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return

  const playerIndex = e.player_index

  if (!isWorldEntityProjectEntity(entity)) {
    return
  }

  // A blueprint paste that creates a new entity raises on_built_entity (not on_blueprint_settings_pasted).
  // Stage info (bp100) and item requests ride along in the blueprint entity tags.
  const stagedInfo = e.tags?.bp100 as StageInfoExport | nil
  const pasteItems = getPasteItemRequests(e.tags)
  if (stagedInfo != nil || pasteItems != nil) {
    applyPastedEntity(stage, entity, nil, playerIndex, stagedInfo, pasteItems)
    return
  }

  const wasUnderground = entity.type == "underground-belt"
  const pos = entity.position
  if (tryFastReplace(entity, stage, playerIndex)) {
    if (wasUnderground && lastPreBuild && !Pos.equals(pos, lastPreBuild.event.position)) {
      getState().lastPreBuild = lastPreBuild
    }

    return
  }

  if (lastPreBuild == nil) {
    stage.actions.onEntityCreated(entity, stage.stageNumber, playerIndex)
    return
  }
  const undoAction = stage.actions.onEntityCreated(entity, stage.stageNumber, playerIndex)
  if (undoAction) {
    registerUndoActionLater(undoAction)
  }
})

function tryFastReplace(entity: LuaEntity, stage: Stage, player: PlayerIndex): boolean | nil {
  const toBeFastReplaced = getToBeFastReplaced()
  if (!toBeFastReplaced) return

  if (isFastReplaceable(toBeFastReplaced, entity)) {
    stage.actions.onEntityPossiblyUpdated(entity, stage.stageNumber, toBeFastReplaced.direction, player)
    clearToBeFastReplacedField()
    return true
  }
  clearToBeFastReplaced()
}

function isFastReplaceable(old: LuaEntityInfo, next: LuaEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && areUpgradeableTypes(old.name, next.name)
}

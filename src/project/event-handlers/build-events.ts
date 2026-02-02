import { EventId, LuaEntity, MapPosition, OnPlayerMinedEntityEvent, PlayerIndex } from "factorio:runtime"
import { oppositedirection } from "util"
import { Prototypes } from "../../constants"
import { LuaEntityInfo } from "../../entity/Entity"
import { areUpgradeableTypes } from "../../entity/prototype-info"
import { isWorldEntityProjectEntity } from "../../entity/ProjectEntity"
import { ProtectedEvents } from "../../lib"
import { Pos } from "../../lib/geometry"
import { getStageAtSurface } from "../project-refs"
import { Stage } from "../Project"
import { onUndoReferenceBuilt, registerUndoActionLater } from "../actions/undo"
import { onEntityMarkerBuilt, onPreBlueprintPasted } from "./blueprint-paste"
import {
  clearToBeFastReplaced,
  getInnerName,
  luaEntityPossiblyUpdated,
  setToBeFastReplaced,
  getState,
} from "./shared-state"

const Events = ProtectedEvents

interface FutureBlueprintSettingsPastedEvent {
  entity: LuaEntity
  tags?: import("factorio:runtime").Tags
  player_index?: PlayerIndex
}

const blueprint_settings_pasted_event_id = (defines.events as any).on_blueprint_settings_pasted as
  | EventId<FutureBlueprintSettingsPastedEvent>
  | undefined

if (blueprint_settings_pasted_event_id) {
  script.on_event(blueprint_settings_pasted_event_id, (event) => {
    luaEntityPossiblyUpdated(event.entity, event.player_index)
  })
}

Events.on_pre_build((e) => {
  const player = game.get_player(e.player_index)!
  getState().currentBlueprintPaste = nil

  const surface = player.surface
  if (player.is_cursor_blueprint()) {
    const stage = getStageAtSurface(surface.index)
    onPreBlueprintPasted(player, stage, e, !!blueprint_settings_pasted_event_id)
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
    const pair = entity.neighbours as LuaEntity | nil
    if (pair && isFastReplaceCompatible(position, pair.position, item, pair.name, event.direction, pair.direction)) {
      return true
    }
  }
}

Events.on_player_mined_entity((e) => {
  if (getState().currentBlueprintPaste != nil) return
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

  const currentBlueprintPaste = getState().currentBlueprintPaste
  if (currentBlueprintPaste) {
    if (innerName == Prototypes.EntityMarker) onEntityMarkerBuilt(e, entity)
    return
  }
  if (getState().pendingBplibPaste) {
    return
  }
  if (innerName == Prototypes.EntityMarker) {
    entity.destroy()
    return
  }

  const lastPreBuild = getState().lastPreBuild
  getState().lastPreBuild = nil

  const stage = getStageAtSurface(entity.surface_index)
  if (!stage) return

  const playerIndex = e.player_index

  if (!isWorldEntityProjectEntity(entity)) {
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
  const { toBeFastReplaced } = getState()
  if (!toBeFastReplaced) return

  if (isFastReplaceable(toBeFastReplaced, entity)) {
    stage.actions.onEntityPossiblyUpdated(entity, stage.stageNumber, toBeFastReplaced.direction, player)
    getState().toBeFastReplaced = nil
    return true
  }
  clearToBeFastReplaced()
}

function isFastReplaceable(old: LuaEntityInfo, next: LuaEntityInfo): boolean {
  return Pos.equals(old.position, next.position) && areUpgradeableTypes(old.name, next.name)
}

import { LuaPlayer } from "factorio:runtime"
import { BobInserterChangedPositionEvent } from "../../declarations/mods"
import { ProjectEntity, isWorldEntityProjectEntity } from "../../entity/ProjectEntity"
import { getRegisteredProjectEntity } from "../../entity/registration"
import { ProtectedEvents } from "../../lib"
import { withTileEventsDisabled } from "../../tiles/tile-events"
import { getStageAtSurface } from "../project-refs"
import { hasMayHaveModdedGui } from "../../entity/prototype-info"
import { luaEntityPossiblyUpdated } from "./shared-state"

const Events = ProtectedEvents
declare const storage: StorageWithPlayer

Events.on_chunk_generated((e) => {
  const stage = getStageAtSurface(e.surface.index)
  if (!stage) return
  const entities = e.surface.find_entities_filtered({
    type: ["simple-entity-with-owner", "rail-remnants"],
    area: e.area,
  })
  const { stageNumber, project } = stage

  const { actions } = stage
  for (const entity of entities) {
    if (entity.valid) actions.onChunkGeneratedForEntity(entity, stageNumber)
  }

  const status = defines.chunk_generated_status.entities
  for (const stage of project.getAllStages()) {
    const position = e.position
    if (!stage.getSurface().is_chunk_generated(position)) {
      if (stage.getSurface().generate_with_lab_tiles) {
        withTileEventsDisabled(stage.getSurface().build_checkerboard, e.area)
        stage.getSurface().set_chunk_generated_status(position, status)
      } else {
        stage.getSurface().request_to_generate_chunks(position, 1)
      }
    }
  }
})

Events.onInitOrLoad(() => {
  for (const mod of ["bobinserters", "boblogistics"]) {
    if (mod in remote.interfaces) {
      const eventId = remote.call(
        mod,
        "get_changed_position_event_id",
      ) as import("factorio:runtime").CustomEventId<BobInserterChangedPositionEvent>
      Events.on(eventId, (e) => luaEntityPossiblyUpdated(e.entity, nil))
    }
  }
})

Events.on_gui_closed((e) => {
  const entity = e.entity

  const playerData = storage.players[e.player_index]
  const oldEntity = playerData.possiblyOpenedModdedEntity
  if (e.gui_type == defines.gui_type.custom && oldEntity && playerData.confirmedModdedEntityOpen) {
    if (oldEntity.original.valid) {
      luaEntityPossiblyUpdated(oldEntity.original, e.player_index)
    } else {
      const foundEntity = oldEntity.surface.find_entities_filtered({
        position: oldEntity.position,
        radius: 0,
        type: oldEntity.type,
        direction: oldEntity.direction,
        limit: 1,
      })[0]
      if (foundEntity != nil) {
        luaEntityPossiblyUpdated(foundEntity, e.player_index)
      }
    }
  }

  playerData.possiblyOpenedModdedEntity = nil

  if (
    entity &&
    entity.valid &&
    hasMayHaveModdedGui(entity.name) &&
    getStageAtSurface(entity.surface.index) != nil &&
    isWorldEntityProjectEntity(entity)
  ) {
    playerData.possiblyOpenedModdedEntity = {
      belt_to_ground_type: nil,
      direction: entity.direction,
      name: entity.name,
      position: entity.position,
      surface: entity.surface,
      type: entity.type,
      original: entity,
    }
  }
})
Events.on_gui_opened((e) => {
  const playerData = storage.players[e.player_index]
  if (
    playerData.possiblyOpenedModdedEntity &&
    (e.element || (playerData.confirmedModdedEntityOpen && e.entity == playerData.possiblyOpenedModdedEntity.original))
  ) {
    playerData.confirmedModdedEntityOpen = true
  } else {
    playerData.possiblyOpenedModdedEntity = nil
    playerData.possiblyOpenedModdedEntity = nil
  }
})

export function getCurrentlyOpenedModdedGui(player: LuaPlayer): ProjectEntity | nil {
  const playerData = storage.players[player.index]
  const entity = playerData.possiblyOpenedModdedEntity
  if (!entity || !playerData.confirmedModdedEntityOpen) return nil
  const stage = getStageAtSurface(entity.surface.index)
  if (!stage) return nil
  const toMatch = entity.original.valid ? entity.original : entity
  return stage.project.content.findCompatibleWithLuaEntity(toMatch, nil, stage.stageNumber)
}

Events.on_surface_cleared((e) => {
  const stage = getStageAtSurface(e.surface_index)
  if (!stage) return
  stage.actions.onSurfaceCleared(stage.stageNumber)
})

const reverseMap: Record<defines.train_state, string> = {}
for (const [k, v] of pairs(defines.train_state)) {
  reverseMap[v] = k
}
Events.on_train_changed_state((e) => {
  if (e.old_state != defines.train_state.no_schedule) return
  const stocks = e.train.locomotives
  let shouldStop = false
  function checkLocomotive(locomotive: import("factorio:runtime").LuaEntity) {
    const projectEntity = getRegisteredProjectEntity(locomotive)
    const mut = projectEntity?._asMut()
    if (mut?.isNewRollingStock) {
      shouldStop = true
      mut.isNewRollingStock = nil
    }
  }
  for (const locomotive of stocks.front_movers) {
    checkLocomotive(locomotive)
  }
  for (const locomotive of stocks.back_movers) {
    checkLocomotive(locomotive)
  }
  if (shouldStop) {
    e.train.manual_mode = true
    e.train.speed = 0
  }
})

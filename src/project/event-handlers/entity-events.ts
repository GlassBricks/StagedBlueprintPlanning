import { UnitNumber } from "factorio:runtime"
import { ProtectedEvents } from "../../lib"
import { handleTileMined } from "../../tiles/tile-events"
import {
  luaEntityCreated,
  luaEntityDeleted,
  luaEntityDied,
  luaEntityMarkedForUpgrade,
  luaEntityPossiblyUpdated,
  luaEntityRotated,
  maybeDestroyObjectForStage,
} from "./shared-state"

import "../../tiles/tile-events"

const Events = ProtectedEvents
const modName = script.mod_name

Events.script_raised_built((e) => {
  if (e.mod_name != modName) luaEntityCreated(e.entity, nil)
})
Events.on_robot_built_entity((e) => luaEntityCreated(e.entity, nil))
Events.on_space_platform_built_entity((e) => luaEntityCreated(e.entity, nil))
Events.script_raised_revive((e) => luaEntityCreated(e.entity, nil))

Events.script_raised_destroy((e) => {
  if (e.mod_name != modName) {
    const entity = e.entity
    if (entity.type == "deconstructible-tile-proxy") {
      const entityPos = entity.position
      const position = {
        x: entityPos.x - 0.5,
        y: entityPos.y - 0.5,
      }
      handleTileMined(entity.surface_index, [{ position }])
      if (entity.valid) entity.destroy()
    } else {
      luaEntityDeleted(entity)
    }
  }
})
Events.registerEarly(defines.events.on_object_destroyed, (e) => {
  if (e.type != defines.target_type.entity) return
  maybeDestroyObjectForStage(e.useful_id as UnitNumber)
})

Events.on_robot_mined_entity((e) => luaEntityDeleted(e.entity))
Events.on_space_platform_mined_entity((e) => luaEntityDeleted(e.entity))

Events.on_entity_died((e) => luaEntityDied(e.entity))

Events.on_entity_settings_pasted((e) => luaEntityPossiblyUpdated(e.destination, e.player_index))
Events.on_gui_closed((e) => {
  if (e.entity) luaEntityPossiblyUpdated(e.entity, e.player_index)
})
Events.on_player_fast_transferred((e) => luaEntityPossiblyUpdated(e.entity, e.player_index))
Events.on_player_dropped_item((e) => luaEntityPossiblyUpdated(e.entity, e.player_index))
Events.on_player_dropped_item_into_entity((e) => luaEntityPossiblyUpdated(e.entity, e.player_index))
Events.on_player_flipped_entity((e) => luaEntityPossiblyUpdated(e.entity, e.player_index))

Events.on_player_rotated_entity((e) => luaEntityRotated(e.entity, e.previous_direction, e.player_index))

Events.on_marked_for_upgrade((e) => luaEntityMarkedForUpgrade(e.entity, e.player_index))

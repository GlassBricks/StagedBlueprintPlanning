import { LuaSurface } from "factorio:runtime"
import { Settings } from "../constants"
import { Events } from "../lib"
import { Position } from "../lib/geometry"
import { getStageAtSurface } from "../project/project-refs"

declare global {
  interface PlayerData {
    lastTeleportLocation?: {
      surface: LuaSurface
      position: Position
    }
  }
}
declare const storage: StorageWithPlayer

Events.on_player_clicked_gps_tag((e) => {
  const player = game.get_player(e.player_index)!
  if (!player.mod_settings[Settings.EntityInfoLocation].value) return
  const targetSurface = game.get_surface(e.surface)
  if (targetSurface == nil) return
  const targetStage = getStageAtSurface(targetSurface.index)
  if (targetStage == nil) return
  if (
    getStageAtSurface(player.surface_index) != nil ||
    player.controller_type == defines.controllers.editor ||
    player.controller_type == defines.controllers.god ||
    player.controller_type == defines.controllers.spectator
  ) {
    storage.players[player.index].lastTeleportLocation = {
      surface: player.surface,
      position: player.position,
    }
    player.teleport(e.position, targetSurface)
    player.set_controller({
      type: defines.controllers.editor,
    })
  }
})

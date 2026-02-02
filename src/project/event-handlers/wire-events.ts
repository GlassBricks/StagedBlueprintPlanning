import { LuaPlayer, PlayerIndex } from "factorio:runtime"
import { CustomInputs } from "../../constants"
import { ProtectedEvents } from "../../lib"
import { getStageAtEntity, getState } from "./shared-state"

const Events = ProtectedEvents

declare const storage: StorageWithPlayer

function markPlayerAffectedWires(player: LuaPlayer): void {
  const entity = player.selected
  if (!entity) return
  const stage = getStageAtEntity(entity)
  if (!stage) return

  const data = storage.players[player.index]
  const existingEntity = data.lastWireAffectedEntity
  if (existingEntity && existingEntity != entity) {
    stage.actions.onWiresPossiblyUpdated(entity, stage.stageNumber, player.index)
  }
  data.lastWireAffectedEntity = entity
}

function clearPlayerAffectedWires(index: PlayerIndex): void {
  const data = storage.players[index]
  const entity = data.lastWireAffectedEntity
  if (entity) {
    data.lastWireAffectedEntity = nil
    const stage = getStageAtEntity(entity)
    if (stage) stage.actions.onWiresPossiblyUpdated(entity, stage.stageNumber, index)
  }
}

const wirePrototypes = newLuaSet("red-wire", "green-wire", "copper-wire")
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
  getState().lastPreBuild = nil
})

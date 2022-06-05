import { GlobalPlayerData, PlayerData } from "../utils/players"
import { Events } from "./Events"
import { Mutable } from "./util-types"

declare const global: {
  players: GlobalPlayerData
}
/**
 * Called when player is initialized (both during on_init and on_player_created).
 */
export function onPlayerInit(action: (player: LuaPlayer) => void): void {
  Events.onAll({
    on_init() {
      for (const [, player] of game.players) {
        action(player)
      }
    },
    on_player_created(e): void {
      action(game.get_player(e.player_index)!)
    },
  })
}
Events.on_init(() => {
  global.players = {}
})
onPlayerInit((player) => {
  ;(global.players as Mutable<GlobalPlayerData>)[player.index] = {} as PlayerData
};)

const playerRemovedHandlers: Array<(playerIndex: PlayerIndex) => void> = []
export function onPlayerRemoved(action: (playerIndex: PlayerIndex) => void): void {
  playerRemovedHandlers.push(action)
}

Events.on_player_removed((e) => {
  const index = e.player_index
  for (const handler of playerRemovedHandlers) {
    handler(index)
  }
  delete global.players[index]
})

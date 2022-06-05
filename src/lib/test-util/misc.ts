export function getPlayer(): LuaPlayer {
  // noinspection LoopStatementThatDoesntLoopJS
  for (const [, player] of pairs(game.players)) {
    return player
  }
  error("Could not find any player")
}

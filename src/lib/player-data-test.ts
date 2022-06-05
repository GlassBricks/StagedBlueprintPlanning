import { PlayerData } from "./player-data"
import { getPlayer } from "./test-util/misc"

const TestPlayerDataName = "-- Test player data --"
const TestData = PlayerData(TestPlayerDataName, () => 1)

test("initialized", () => {
  assert.equal(1, TestData[getPlayer().index])
})

test("can set", () => {
  const player = getPlayer()
  TestData[player.index] = 3
  assert.equal(3, TestData[player.index])
})

// test("Update and delete on player created/removed", () => {
//   script.get_event_handler(defines.events.on_player_removed)({
//     player_index: 1 as PlayerIndex,
//     name: defines.events.on_player_created,
//     tick: game.tick,
//   })
//   assert.is_nil(TestData[1 as PlayerIndex])
//
//   script.get_event_handler(defines.events.on_player_created)({
//     player_index: 1 as PlayerIndex,
//     name: defines.events.on_player_created,
//     tick: game.tick,
//   })
//   assert.equal(1, TestData[1 as PlayerIndex])
//
//   const players: number[] = []
//   for (const [playerIndex, data] of TestData) {
//     assert.equal(TestData[playerIndex], data, "iteration data correct")
//     players.push(playerIndex)
//   }
//   assert.same([getPlayer().index], players, "iterated over all players")
// })
// hard to test without mock player

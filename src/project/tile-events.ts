/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  OnPlayerBuiltTileEvent,
  OnPlayerMinedTileEvent,
  OnRobotBuiltTileEvent,
  OnRobotMinedTileEvent,
  PlayerIndex,
} from "factorio:runtime"
import { ProtectedEvents } from "../lib"
import { getStageAtSurface } from "./stage-surface"

const Events = ProtectedEvents

const script_raised_set_tiles = defines.events.script_raised_set_tiles
/**
 * Temporarily disables the `script_raised_set_tiles` event;
 * This is to improve performance when setting tiles that don't affect a project.
 */
export function withTileEventsDisabled<A extends any[], R>(f: (this: void, ...args: A) => R, ...args: A): R {
  const handler = script.get_event_handler(script_raised_set_tiles)
  script.on_event(script_raised_set_tiles, nil)
  const [success, result] = pcall(f, ...args)
  script.on_event(script_raised_set_tiles, handler)
  if (!success) {
    error(result)
  }
  return result
}

function onTileBuilt(e: OnPlayerBuiltTileEvent | OnRobotBuiltTileEvent, playerIndex?: PlayerIndex): void {
  const stage = getStageAtSurface(e.surface_index)
  if (!stage || !stage.project.stagedTilesEnabled.get()) return
  const { stageNumber } = stage
  const name = e.tile.name
  const onTileBuilt = stage.actions.onTileBuilt
  for (const posData of e.tiles) {
    onTileBuilt(posData.position, name, stageNumber, playerIndex)
  }
}
Events.on_player_built_tile((e) => {
  onTileBuilt(e, e.player_index)
})
Events.on_robot_built_tile((e) => {
  onTileBuilt(e)
})

Events.script_raised_set_tiles((e) => {
  if (e.mod_name == script.mod_name) return
  const stage = getStageAtSurface(e.surface_index)
  if (!stage || !stage.project.stagedTilesEnabled.get()) return
  const { stageNumber } = stage
  const onTileBuilt = stage.actions.onTileBuilt
  for (const posData of e.tiles) {
    onTileBuilt(posData.position, posData.name, stageNumber, nil)
  }
})
function onTileMined(e: OnPlayerMinedTileEvent | OnRobotMinedTileEvent, playerIndex?: PlayerIndex): void {
  const stage = getStageAtSurface(e.surface_index)
  if (!stage || !stage.project.stagedTilesEnabled.get()) return
  const { stageNumber } = stage
  const onTileMined = stage.actions.onTileMined
  for (const posData of e.tiles) {
    onTileMined(posData.position, stageNumber, playerIndex)
  }
}
Events.on_player_mined_tile((e) => {
  onTileMined(e, e.player_index)
})
Events.on_robot_mined_tile((e) => {
  onTileMined(e)
})

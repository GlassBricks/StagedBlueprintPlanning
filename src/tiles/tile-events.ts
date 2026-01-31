// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import {
  MapPosition,
  OnPlayerBuiltTileEvent,
  OnPlayerMinedTileEvent,
  OnRobotBuiltTileEvent,
  OnRobotMinedTileEvent,
  OnSpacePlatformBuiltTileEvent,
  OnSpacePlatformMinedTileEvent,
  SurfaceIndex,
} from "factorio:runtime"
import { ProtectedEvents } from "../lib"
import { getStageAtSurface } from "../project/project-refs"

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

function onTileBuilt(e: OnPlayerBuiltTileEvent | OnRobotBuiltTileEvent | OnSpacePlatformBuiltTileEvent): void {
  const stage = getStageAtSurface(e.surface_index)
  if (!stage || !stage.project.settings.stagedTilesEnabled.get()) return
  const { stageNumber } = stage
  const name = e.tile.name
  const onTileBuilt = stage.actions.onTileBuilt
  for (const posData of e.tiles) {
    onTileBuilt(posData.position, name, stageNumber)
  }
}
Events.on_player_built_tile(onTileBuilt)
Events.on_robot_built_tile(onTileBuilt)
Events.script_raised_set_tiles((e) => {
  if (e.mod_name == script.mod_name) return
  const stage = getStageAtSurface(e.surface_index)
  if (!stage || !stage.project.settings.stagedTilesEnabled.get()) return
  const { stageNumber } = stage
  const onTileBuilt = stage.actions.onTileBuilt
  for (const posData of e.tiles) {
    onTileBuilt(posData.position, posData.name, stageNumber)
  }
})
Events.on_space_platform_built_tile(onTileBuilt)

export function handleTileMined(
  surface_index: SurfaceIndex,
  tiles: readonly { readonly position: MapPosition }[],
): void {
  const stage = getStageAtSurface(surface_index)
  if (!stage || !stage.project.settings.stagedTilesEnabled.get()) return
  const { stageNumber } = stage
  const onTileMined = stage.actions.onTileMined
  for (const posData of tiles) {
    onTileMined(posData.position, stageNumber)
  }
}

function onTileMined(e: OnPlayerMinedTileEvent | OnRobotMinedTileEvent | OnSpacePlatformMinedTileEvent): void {
  handleTileMined(e.surface_index, e.tiles)
}
Events.on_player_mined_tile(onTileMined)
Events.on_robot_mined_tile(onTileMined)
Events.on_space_platform_mined_tile(onTileMined)

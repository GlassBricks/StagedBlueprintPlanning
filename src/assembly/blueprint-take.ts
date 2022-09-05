/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Prototypes } from "../constants"
import { Events, isEmpty, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { L_Interaction } from "../locale"

export interface BlueprintSettings {
  /** Original position + offset = blueprint position */
  positionOffset: Position
  snapToGrid: Position | nil
  positionRelativeToGrid: Position | nil
  absoluteSnapping: boolean
}
export function getDefaultBlueprintSettings(): BlueprintSettings {
  return {
    positionOffset: { x: 0, y: 0 },
    snapToGrid: nil,
    positionRelativeToGrid: nil,
    absoluteSnapping: false,
  }
}

export function tryTakeBlueprintWithSettings(
  stack: BlueprintItemStack,
  settings: BlueprintSettings,
  surface: LuaSurface,
  forEdit: boolean,
): boolean {
  if (!stack.is_blueprint) {
    stack.set_stack("blueprint")
  }

  const bpMapping = stack.create_blueprint({
    surface,
    force: "player",
    area: BBox.coords(-5000, -5000, 5000, 5000),
    include_trains: true,
    include_station_names: true,
    always_include_tiles: true,
  })
  stack.blueprint_snap_to_grid = settings.snapToGrid
  stack.blueprint_absolute_snapping = settings.absoluteSnapping
  stack.blueprint_position_relative_to_grid = settings.positionRelativeToGrid

  if (isEmpty(bpMapping)) return false

  const firstEntityOriginalPosition = bpMapping[1].position

  const entities = stack.get_blueprint_entities()!
  const firstEntityPosition = entities[0].position
  const expectedPosition = Pos.plus(firstEntityOriginalPosition, settings.positionOffset)
  if (!Pos.equals(firstEntityPosition, expectedPosition)) {
    const adjustment = Pos.minus(expectedPosition, firstEntityPosition)
    for (const entity of entities) {
      const pos = entity.position as Mutable<Position>
      pos.x += adjustment.x
      pos.y += adjustment.y
    }
  }
  // if forEdit, add grid-enforcer entity at original position [1, 1]
  if (forEdit) {
    const gridEnforcerPosition = Pos.plus({ x: 1, y: 1 }, settings.positionOffset)
    entities.push({
      entity_number: entities.length + 1,
      name: Prototypes.GridEnforcer,
      position: gridEnforcerPosition,
    })
  }

  stack.set_blueprint_entities(entities)

  return true
}
export interface OpenedBlueprintInfo {
  blueprint: BlueprintItemStack
  settings: BlueprintSettings
}
declare global {
  interface PlayerData {
    lastOpenedBlueprint?: OpenedBlueprintInfo
  }
}
declare const global: GlobalWithPlayers

/**
 * The blueprint should have been created with `tryTakeBlueprintWithSettings` with `forEdit = true`.
 * @param player
 * @param blueprint
 * @param settings
 */
export function editBlueprintSettings(
  player: LuaPlayer,
  blueprint: BlueprintItemStack,
  settings: BlueprintSettings,
): boolean {
  if (!blueprint.valid || !blueprint.valid_for_read || !blueprint.is_blueprint) return false
  const numEntities = blueprint.get_blueprint_entity_count()
  if (numEntities === 0) return false

  global.players[player.index].lastOpenedBlueprint = { blueprint, settings }
  player.opened = blueprint as LuaItemStack

  return true
}
function onBlueprintUpdated(playerIndex: PlayerIndex): void {
  const data = global.players[playerIndex]
  const info = data.lastOpenedBlueprint
  if (!info) return
  delete data.lastOpenedBlueprint

  const { blueprint, settings } = info
  const entities = blueprint.get_blueprint_entities()!
  const gridEnforcer = entities[entities.length - 1]
  if (!gridEnforcer || gridEnforcer.name !== Prototypes.GridEnforcer) {
    const player = game.get_player(playerIndex)!
    return player.create_local_flying_text({
      text: [L_Interaction.GridEnforcerRemoved],
      create_at_cursor: true,
    })
  }

  const gridEnforcerPosition = gridEnforcer.position
  // original position + offset = blueprint position
  // offset = blueprint position - original position
  const offset = Pos.minus(gridEnforcerPosition, { x: 1, y: 1 })

  settings.positionOffset = offset
  settings.absoluteSnapping = blueprint.blueprint_absolute_snapping
  settings.snapToGrid = blueprint.blueprint_snap_to_grid
  settings.positionRelativeToGrid = blueprint.blueprint_position_relative_to_grid
}
Events.on_gui_closed((e) => {
  onBlueprintUpdated(e.player_index)
})

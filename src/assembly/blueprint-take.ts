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

import { Events, isEmpty, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { L_Interaction } from "../locale"

export interface BlueprintSettings {
  name: string
  icons: BlueprintSignalIcon[] | nil

  /** Original position + offset = blueprint position */
  positionOffset: Position
  snapToGrid?: Position
  positionRelativeToGrid?: Position
  absoluteSnapping: boolean
}
export function getDefaultBlueprintSettings(): BlueprintSettings {
  return {
    name: "",
    icons: nil,
    positionOffset: { x: 0, y: 0 },
    absoluteSnapping: false,
  }
}
export function tryTakeBlueprintWithSettings(
  stack: LuaItemStack,
  settings: BlueprintSettings,
  surface: LuaSurface,
  bbox: BBox,
): boolean {
  return takeBlueprintWithSettings(stack, settings, surface, bbox, false)
}

const FirstEntityOriginalPositionTag = "bp100:FirstEntityOriginalPosition"
/**
 * If forEdit is true, sets the first entity's original position tag.
 */
function takeBlueprintWithSettings(
  stack: LuaItemStack,
  settings: BlueprintSettings,
  surface: LuaSurface,
  bbox: BBox,
  forEdit: boolean,
): boolean {
  if (!stack.is_blueprint) {
    stack.set_stack("blueprint")
  }

  const bpMapping = stack.create_blueprint({
    surface,
    force: "player",
    area: bbox,
    include_trains: true,
    include_station_names: true,
    always_include_tiles: true,
  })

  if (isEmpty(bpMapping)) {
    stack.blueprint_icons = nil // bug workaround
    return false
  }

  const firstEntityOriginalPosition = bpMapping[1].position
  if (settings.snapToGrid !== nil) {
    const entities = stack.get_blueprint_entities()!
    const firstEntityPosition = entities[0].position
    const expectedPosition = Pos.plus(firstEntityOriginalPosition, settings.positionOffset)
    const shouldAdjustPosition = !Pos.equals(firstEntityPosition, expectedPosition)
    if (shouldAdjustPosition) {
      const { x, y } = Pos.minus(expectedPosition, firstEntityPosition)
      for (const entity of entities) {
        const pos = entity.position as Mutable<Position>
        pos.x += x
        pos.y += y
      }
      stack.set_blueprint_entities(entities)
    }
  }

  stack.label = settings.name
  stack.blueprint_icons = settings.icons ?? (stack.default_icons as unknown as BlueprintSignalIcon[])
  stack.blueprint_snap_to_grid = settings.snapToGrid
  stack.blueprint_absolute_snapping = settings.absoluteSnapping
  stack.blueprint_position_relative_to_grid = settings.positionRelativeToGrid

  if (forEdit) {
    stack.set_blueprint_entity_tag(1, FirstEntityOriginalPositionTag, firstEntityOriginalPosition)
  }
  return true
}

interface BlueprintEditInfo {
  blueprintInventory: LuaInventory
  settings: BlueprintSettings
}
declare global {
  interface PlayerData {
    lastOpenedBlueprint?: unknown
    blueprintEditInfo?: BlueprintEditInfo
  }
}
declare const global: GlobalWithPlayers

Migrations.to("0.8.0", () => {
  for (const [, data] of pairs(global.players)) {
    data.lastOpenedBlueprint = nil
  }
})

function clearOpenedBlueprint(playerIndex: PlayerIndex): void {
  const data = global.players[playerIndex]
  if (data && data.blueprintEditInfo) {
    const inventory = data.blueprintEditInfo.blueprintInventory
    if (inventory && inventory.valid) inventory.destroy()
    data.blueprintEditInfo = nil
  }
}

export function editBlueprintSettings(
  player: LuaPlayer,
  settings: BlueprintSettings,
  surface: LuaSurface,
  bbox: BBox,
): boolean {
  clearOpenedBlueprint(player.index)
  const inventory = game.create_inventory(1)
  const blueprint = inventory[0]

  const firstEntityPosition = takeBlueprintWithSettings(blueprint, settings, surface, bbox, true)
  if (!firstEntityPosition) {
    inventory.destroy()
    return false
  }

  global.players[player.index].blueprintEditInfo = {
    blueprintInventory: inventory,
    settings,
  }
  player.opened = blueprint

  return true
}
function onBlueprintUpdated(playerIndex: PlayerIndex): void {
  const data = global.players[playerIndex]
  const info = data.blueprintEditInfo
  if (!info) return
  delete data.blueprintEditInfo

  tryUpdateSettings(playerIndex, info)
  const bpInventory = info.blueprintInventory
  if (bpInventory.valid) bpInventory.destroy()
}
function tryUpdateSettings(playerIndex: PlayerIndex, info: BlueprintEditInfo): void {
  const inventory = info.blueprintInventory
  if (!inventory.valid) return
  const blueprint = inventory[0]
  if (!blueprint.valid_for_read || !blueprint.is_blueprint) return

  const settings = info.settings
  settings.name = blueprint.label ?? ""
  const icons = blueprint.blueprint_icons
  if (icons && icons[0]) settings.icons = icons
  else settings.icons = nil
  settings.snapToGrid = blueprint.blueprint_snap_to_grid
  settings.absoluteSnapping = blueprint.blueprint_absolute_snapping
  settings.positionRelativeToGrid = blueprint.blueprint_position_relative_to_grid

  if (settings.snapToGrid !== nil) {
    const originalPosition = blueprint.get_blueprint_entity_tag(1, FirstEntityOriginalPositionTag) as Position | nil
    if (!originalPosition) {
      notifyFirstEntityRemoved(playerIndex)
    } else {
      const bpPosition = blueprint.get_blueprint_entities()![0].position
      settings.positionOffset = Pos.minus(bpPosition, originalPosition)
    }
  }
}
function notifyFirstEntityRemoved(playerIndex: PlayerIndex): void {
  const player = game.get_player(playerIndex)
  if (player)
    player.create_local_flying_text({
      create_at_cursor: true,
      text: [L_Interaction.BlueprintFirstEntityRemoved],
    })
}
Events.on_gui_closed((e) => onBlueprintUpdated(e.player_index))

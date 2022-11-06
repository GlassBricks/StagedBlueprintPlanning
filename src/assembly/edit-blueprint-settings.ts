/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Prototypes } from "../constants"
import { Events } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { L_Interaction } from "../locale"
import {
  BlueprintSettings,
  BlueprintTransformations,
  FirstEntityOriginalPositionTag,
  takeBlueprintWithSettings,
} from "./take-blueprint"

interface BlueprintEditInfo {
  blueprintInventory: LuaInventory
  settings?: BlueprintSettings
  transformations?: BlueprintTransformations
}
declare global {
  interface PlayerData {
    blueprintEditInfo?: BlueprintEditInfo
  }
}
declare const global: GlobalWithPlayers

function clearOpenedItem(playerIndex: PlayerIndex): void {
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
  transform: BlueprintTransformations,
  surface: LuaSurface,
  bbox: BBox,
): LuaItemStack | nil {
  clearOpenedItem(player.index)
  const inventory = game.create_inventory(1)
  const blueprint = inventory[0]

  const took = takeBlueprintWithSettings(blueprint, settings, transform, surface, bbox, true)
  if (!took) {
    inventory.destroy()
    return
  }

  global.players[player.index].blueprintEditInfo = {
    blueprintInventory: inventory,
    settings,
  }
  player.opened = blueprint

  return blueprint
}

export function editBlueprintFilters(player: LuaPlayer, transform: BlueprintTransformations): LuaItemStack | nil {
  clearOpenedItem(player.index)
  const inventory = game.create_inventory(1)
  const stack = inventory[0]

  stack.set_stack(Prototypes.BlueprintFilters)

  if (transform.entityFilters) {
    stack.entity_filters = Object.keys(transform.entityFilters)
  }
  if (transform.entityFilterMode) {
    stack.entity_filter_mode = transform.entityFilterMode
  }

  global.players[player.index].blueprintEditInfo = {
    blueprintInventory: inventory,
    transformations: transform,
  }
  player.opened = stack

  return stack
}

function notifyFirstEntityRemoved(playerIndex: PlayerIndex): void {
  const player = game.get_player(playerIndex)
  if (player)
    player.create_local_flying_text({
      create_at_cursor: true,
      text: [L_Interaction.BlueprintFirstEntityRemoved],
    })
}
function updateBlueprintSettings(blueprint: LuaItemStack, settings: BlueprintSettings, playerIndex: PlayerIndex): void {
  settings.name = blueprint.label ?? ""
  const icons = blueprint.blueprint_icons
  if (icons && icons[0]) settings.icons = icons
  else settings.icons = nil
  settings.snapToGrid = blueprint.blueprint_snap_to_grid
  settings.absoluteSnapping = blueprint.blueprint_absolute_snapping
  settings.positionRelativeToGrid = blueprint.blueprint_position_relative_to_grid

  if (settings.snapToGrid != nil) {
    const originalPosition = blueprint.get_blueprint_entity_tag(1, FirstEntityOriginalPositionTag) as Position | nil
    if (!originalPosition) {
      notifyFirstEntityRemoved(playerIndex)
    } else {
      const bpPosition = blueprint.get_blueprint_entities()![0].position
      settings.positionOffset = Pos.minus(bpPosition, originalPosition)
    }
  }
}
function updateBlueprintFilters(stack: LuaItemStack, transform: BlueprintTransformations): void {
  const filters = stack.entity_filters
  if (filters != nil) {
    transform.entityFilters = newLuaSet()
    for (const filter of filters) transform.entityFilters.add(filter)
    transform.entityFilterMode = stack.entity_filter_mode
  } else {
    transform.entityFilters = nil
    transform.entityFilterMode = nil
  }
}

function tryUpdateSettings(playerIndex: PlayerIndex, info: BlueprintEditInfo): void {
  const inventory = info.blueprintInventory
  if (!inventory.valid) return
  const stack = inventory[0]
  if (!stack.valid_for_read) return

  if (info.settings) {
    if (!stack.is_blueprint) return
    updateBlueprintSettings(stack, info.settings, playerIndex)
  } else if (info.transformations) {
    if (stack.name != Prototypes.BlueprintFilters) return
    updateBlueprintFilters(stack, info.transformations)
  }
}
Events.on_gui_closed((e) => {
  const playerIndex = e.player_index
  const data = global.players[playerIndex]
  const info = data.blueprintEditInfo
  if (!info) return
  delete data.blueprintEditInfo

  tryUpdateSettings(playerIndex, info)
  const bpInventory = info.blueprintInventory
  if (bpInventory.valid) bpInventory.destroy()
})

Migrations.to("0.8.0", () => {
  for (const [, data] of pairs(global.players)) {
    ;(data as any).lastOpenedBlueprint = nil
  }
})

/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaInventory, LuaItemStack, LuaPlayer, LuaSurface, PlayerIndex } from "factorio:runtime"
import { Events, isEmpty, MutableProperty } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { L_Interaction } from "../locale"
import { BlueprintSettingsTable, BlueprintTakeSettings, StageBlueprintSettingsTable } from "./blueprint-settings"
import { FirstEntityOriginalPositionTag, takeSingleBlueprint } from "./take-single-blueprint"

interface BlueprintEditInfo {
  blueprintInventory: LuaInventory
  settings: BlueprintSettingsTable
  stageSettings?: StageBlueprintSettingsTable
  editType: "blueprint-item" | "additionalWhitelist" | "blacklist"
}
declare global {
  interface PlayerData {
    blueprintEditInfo?: BlueprintEditInfo
  }
}
declare const storage: StorageWithPlayer

function clearOpenedItem(playerIndex: PlayerIndex): void {
  const data = storage.players[playerIndex]
  if (data && data.blueprintEditInfo) {
    const inventory = data.blueprintEditInfo.blueprintInventory
    if (inventory && inventory.valid) inventory.destroy()
    data.blueprintEditInfo = nil
  }
}

function getBasicBlueprintTakeParams(settings: BlueprintSettingsTable): BlueprintTakeSettings {
  return {
    positionOffset: settings.positionOffset.get(),
    snapToGrid: settings.snapToGrid.get(),
    positionRelativeToGrid: settings.positionRelativeToGrid.get(),
    absoluteSnapping: settings.absoluteSnapping.get(),
    stageLimit: nil,
    excludeFromFutureBlueprints: false,
    additionalWhitelist: nil,
    blacklist: settings.blacklist.get(),
    icon1: settings.icon1.get(),
    icon2: settings.icon2.get(),
    icon3: settings.icon3.get(),
    icon4: settings.icon4.get(),
    appendStageNumbersToIcons: settings.appendStageNumbersToIcons.get(),
  }
}

export function editInItemBlueprintSettings(
  player: LuaPlayer,
  settings: BlueprintSettingsTable,
  stageSettings: StageBlueprintSettingsTable | nil,
  surface: LuaSurface,
  bbox: BBox,
  bpName: string,
): LuaItemStack | nil {
  clearOpenedItem(player.index)
  const inventory = game.create_inventory(1)
  const blueprint = inventory[0]
  const took = takeSingleBlueprint({
    stack: blueprint,
    settings: getBasicBlueprintTakeParams(settings),
    surface,
    bbox,
    unitNumberFilter: nil,
    setOrigPositionTag: true,
    stageName: bpName,
  })

  if (!took) {
    inventory.destroy()
    return
  }
  blueprint.label = bpName
  if (stageSettings != nil) {
    blueprint.blueprint_description = stageSettings.description.get()
  }

  storage.players[player.index].blueprintEditInfo = {
    blueprintInventory: inventory,
    settings,
    stageSettings,
    editType: "blueprint-item",
  }
  player.opened = blueprint

  return blueprint
}

function notifyFirstEntityRemoved(playerIndex: PlayerIndex): void {
  const player = game.get_player(playerIndex)
  if (player)
    player.create_local_flying_text({
      create_at_cursor: true,
      text: [L_Interaction.BlueprintFirstEntityRemoved],
    })
}

export function updateBasicBlueprintSettings(blueprint: LuaItemStack, settings: BlueprintSettingsTable): void {
  const snapToGrid = blueprint.blueprint_snap_to_grid
  if (snapToGrid == nil) {
    settings.snapToGrid.set(nil)
    // keep position offset for later
    return
  }

  settings.snapToGrid.set(snapToGrid)
  settings.absoluteSnapping.set(blueprint.blueprint_absolute_snapping)
  settings.positionRelativeToGrid.set(blueprint.blueprint_position_relative_to_grid)
}

function updateBlueprintGridSettings(
  blueprint: LuaItemStack,
  settings: BlueprintSettingsTable,
  playerIndex: PlayerIndex | nil,
): void {
  if (playerIndex != nil) {
    const originalPosition = blueprint.get_blueprint_entity_tag(1, FirstEntityOriginalPositionTag) as Position | nil
    if (!originalPosition) return notifyFirstEntityRemoved(playerIndex)
    const bpPosition = blueprint.get_blueprint_entities()![0].position
    settings.positionOffset.set(Pos.minus(bpPosition, originalPosition))
  }

  updateBasicBlueprintSettings(blueprint, settings)
}

function updateBlueprintSettings(
  blueprint: LuaItemStack,
  settings: BlueprintSettingsTable,
  stageSettings: StageBlueprintSettingsTable | nil,
  playerIndex: PlayerIndex | nil,
): void {
  updateBlueprintGridSettings(blueprint, settings, playerIndex)

  if (stageSettings) {
    stageSettings.description.set(blueprint.blueprint_description)
  }
}

function updateBlueprintFilters(stack: LuaItemStack, property: MutableProperty<ReadonlyLuaSet<string> | nil>): void {
  const filters = stack.entity_filters
  if (isEmpty(filters)) {
    property.set(nil)
    return
  }

  const result = new LuaSet<string>()
  for (const [, filter] of pairs(filters as Record<number, string>)) result.add(filter)
  property.set(result)
}

function tryUpdateSettings(playerIndex: PlayerIndex, info: BlueprintEditInfo): void {
  const inventory = info.blueprintInventory
  if (!inventory.valid) return
  const stack = inventory[0]
  if (!stack.valid_for_read) return

  if (info.editType == "blueprint-item") {
    if (!stack.is_blueprint) return
    updateBlueprintSettings(stack, info.settings, info.stageSettings, playerIndex)
  } else if (info.editType == "additionalWhitelist" || info.editType == "blacklist") {
    assume<BlueprintSettingsTable>(info.settings)
    updateBlueprintFilters(stack, info.settings[info.editType])
  }
}

Events.on_gui_closed((e) => {
  const playerIndex = e.player_index
  const data = storage.players[playerIndex]
  const info = data.blueprintEditInfo
  if (!info) return
  delete data.blueprintEditInfo

  tryUpdateSettings(playerIndex, info)
  const bpInventory = info.blueprintInventory
  if (bpInventory.valid) bpInventory.destroy()
})

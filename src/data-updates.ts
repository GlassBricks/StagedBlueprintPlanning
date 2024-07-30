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

import { PrototypeData } from "factorio:common"
import { ItemPrototype, Sound } from "factorio:prototype"
import { FlexibleOffshorePumpPlacement, Settings } from "./constants"

declare const data: PrototypeData
if (settings.startup[Settings.FlexibleOffshorePumpPlacement].value == FlexibleOffshorePumpPlacement.Enabled) {
  for (const [, offshorePump] of pairs(data.raw["offshore-pump"])) {
    offshorePump.adjacent_tile_collision_test = []
    offshorePump.adjacent_tile_collision_mask = []
    offshorePump.check_bounding_box_collides_with_tiles = false
    offshorePump.placeable_position_visualization = nil
    offshorePump.flags = offshorePump.flags!.filter((x) => x != "filter-directions")
  }
}

const minableLandfill = settings.startup[Settings.MinableLandfill].value
const landfillOnLand = settings.startup[Settings.LandLandfill].value
if (landfillOnLand || minableLandfill) {
  for (const type in defines.prototypes.item) {
    const items = data.raw[type as keyof typeof defines.prototypes.item]
    for (const [, item] of pairs<Record<string, ItemPrototype | nil>>(items)) {
      const placeAsTile = item.place_as_tile
      if (!placeAsTile || placeAsTile.condition.length != 1 || placeAsTile.condition[0] != "ground-tile") continue

      if (minableLandfill) {
        const tile = data.raw.tile[placeAsTile.result]
        if (!tile || tile.minable) continue

        tile.minable = {
          mining_time: 0.1,
          result: item.name,
          count: 1,
        }
        const buildSound = tile.build_sound
        if (buildSound)
          tile.mined_sound ??=
            "small" in buildSound || "medium" in buildSound || "large" in buildSound
              ? (buildSound.small ?? buildSound.medium ?? buildSound.large)
              : (buildSound as Sound)
      }
      if (landfillOnLand) {
        placeAsTile.condition = []
        placeAsTile.condition_size = 0
      }
    }
  }
  if (minableLandfill) {
    for (const [, tilePrototype] of pairs(data.raw.tile)) {
      if (tilePrototype.collision_mask.some((x) => x == "water-tile" || x == "object-layer")) {
        tilePrototype.check_collision_with_entities = true
      }
    }
  }
}

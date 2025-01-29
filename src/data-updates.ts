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
import { ItemPrototype } from "factorio:prototype"
import { Settings } from "./constants"

declare const data: PrototypeData

if (settings.startup[Settings.UnhideInfinityItems].value) {
  function removeHiddenFlag(prototype: ItemPrototype | nil): void {
    if (prototype) prototype.hidden = false
  }
  removeHiddenFlag(data.raw.item["electric-energy-interface"])
  removeHiddenFlag(data.raw.item["linked-chest"])
  removeHiddenFlag(data.raw.item["linked-belt"])
  removeHiddenFlag(data.raw.item["heat-interface"])
  removeHiddenFlag(data.raw.item["infinity-chest"])
  removeHiddenFlag(data.raw.item["infinity-pipe"])
}

// if (settings.startup[Settings.FlexibleOffshorePumpPlacement].value) {
//   for (const [, pump] of pairs(data.raw["offshore-pump"])) {
//     pump.tile_buildability_rules = nil
//     pump.placeable_position_visualization = nil
//     pump.flags = pump.flags?.filter((f) => f != "filter-directions")
//   }
// }

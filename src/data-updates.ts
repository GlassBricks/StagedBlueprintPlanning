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
import { FlexibleOffshorePumpPlacement, Settings } from "./constants"

declare const data: PrototypeData
const value = settings.startup[Settings.FlexibleOffshorePumpPlacement].value as FlexibleOffshorePumpPlacement
if (value == FlexibleOffshorePumpPlacement.Enabled) {
  for (const [, offshorePump] of pairs(data.raw["offshore-pump"])) {
    offshorePump.adjacent_tile_collision_test = []
    offshorePump.adjacent_tile_collision_mask = []
    offshorePump.check_bounding_box_collides_with_tiles = false
    offshorePump.placeable_position_visualization = nil
    offshorePump.flags = offshorePump.flags!.filter((x) => x != "filter-directions")
  }
}

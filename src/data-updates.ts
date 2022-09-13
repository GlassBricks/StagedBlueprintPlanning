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

import { Data } from "typed-factorio/data/types"
import { FlexibleOffshorePumpPlacement, Settings } from "./constants"

declare const data: Data
const value = settings.startup[Settings.FlexibleOffshorePumpPlacement].value as FlexibleOffshorePumpPlacement
if (value !== FlexibleOffshorePumpPlacement.Disabled) {
  const offshorePump = data.raw["offshore-pump"]["offshore-pump"]
  if (!offshorePump)
    error("Flexible offshore pump placement is enabled, but the offshore pump prototype could not be found.")
  offshorePump.fluid_box_tile_collision_test = []
  offshorePump.adjacent_tile_collision_box = [
    [-0.05, -0.8],
    [0.05, -0.7],
  ]
  if (value === FlexibleOffshorePumpPlacement.Anywhere) {
    offshorePump.adjacent_tile_collision_test = []
    offshorePump.adjacent_tile_collision_mask = []
    offshorePump.check_bounding_box_collides_with_tiles = false
    offshorePump.placeable_position_visualization = nil
    offshorePump.flags = (offshorePump.flags as Array<keyof EntityPrototypeFlags>).filter(
      (x) => x !== "filter-directions",
    )
  }
}

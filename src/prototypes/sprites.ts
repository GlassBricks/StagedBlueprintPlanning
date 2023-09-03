/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { PrototypeData } from "factorio:common"
import { Sprite, SpritePrototype } from "factorio:prototype"
import { MapPositionArray } from "factorio:runtime"
import { Sprites } from "../constants"

declare const data: PrototypeData
// Sprites
function createSprite(name: string, filename: string, size: number, mipmaps?: number): SpritePrototype {
  return {
    type: "sprite",
    name,
    filename,
    size,
    flags: ["icon"],
    mipmap_count: mipmaps,
  }
}

data.extend([
  createSprite(Sprites.CollapseLeft, "__bp100__/graphics/icons/collapse-left.png", 32, 2),
  createSprite(Sprites.CollapseLeftDark, "__bp100__/graphics/icons/collapse-left-dark.png", 32, 2),
])

function shiftedBlueprintSprite(shift: MapPositionArray, filename: string): Sprite {
  return {
    filename,
    size: 64,
    mipmap_count: 4,
    shift,
    scale: 0.75,
  }
}

const blueprintImage = "__base__/graphics/icons/blueprint.png"
data.extend([
  {
    type: "sprite",
    name: Sprites.BlueprintStages,
    layers: [
      {
        filename: blueprintImage,
        size: 64,
        mipmap_count: 4,
        tint: [0, 0, 0, 0],
      },
      shiftedBlueprintSprite([-6, -6], blueprintImage),
      shiftedBlueprintSprite([0, 0], blueprintImage),
      shiftedBlueprintSprite([6, 6], blueprintImage),
    ],
  },
])

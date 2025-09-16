// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
    flags: ["gui-icon"],
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
data.extend<SpritePrototype>([
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

data.extend<SpritePrototype>([
  createSprite(Sprites.NewBlueprint, "__base__/graphics/icons/shortcut-toolbar/mip/new-blueprint-x24.png", 24, 2),
])

/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { Data } from "typed-factorio/data/types"
import * as util from "util"
import { BuildableEntityTypes, Prototypes } from "./constants"
import {
  BasicSprite,
  EntityPrototype,
  IconData,
  ItemPrototype,
  SimpleEntityWithOwnerPrototype,
  Sprite,
  Sprite4Way,
  UtilityConstants,
} from "./declarations/data"
import { BBox } from "./lib/geometry"
import { debugPrint } from "./lib/test/misc"
import { L_Bp3 } from "./locale"
import direction = defines.direction
import ceil = math.ceil
import max = math.max
import min = math.min

declare const data: Data

function mixColor(color1: Color | ColorArray | nil, color2: Color | ColorArray): Color | ColorArray {
  return color1 ? util.mix_color(color1 as Color, color2 as Color) : color2
}

interface IconSpecification {
  icon?: string
  icons?: IconData[]
  icon_size?: number
  icon_mipmaps?: number
}

const iconTint: ColorArray = [0.5, 0.5, 0.5, 0.6]
function iconToSprite(icon: IconSpecification, scale: number): Sprite | nil {
  if (icon.icon) {
    // simple icon
    return {
      filename: icon.icon,
      priority: "extra-high",
      flags: ["icon"],
      size: icon.icon_size ?? 32,
      mipmap_count: icon.icon_mipmaps,
      scale,
      tint: iconTint,
    }
  } else if (icon.icons) {
    const layers = icon.icons.map(
      (iconData): BasicSprite => ({
        filename: iconData.icon,
        priority: "extra-high",
        flags: ["icon"],
        size: iconData.icon_size ?? icon.icon_size ?? 32,
        tint: mixColor(iconData.tint, iconTint),
        shift: iconData.shift,
        scale: (iconData.scale ?? 1) * scale,
        mipmap_count: iconData.icon_mipmaps,
      }),
    )
    return { layers }
  }
}

const whiteTile = "__base__/graphics/terrain/lab-tiles/lab-white.png"
const outlineTint: ColorArray = [0.5, 0.5, 0.5, 0.2]
export function createWhiteSprite(
  rawBBox: BoundingBoxWrite | BoundingBoxArray,
  color: Color | nil,
  icon: IconSpecification | nil,
): Sprite | Sprite4Way {
  const bbox = BBox.normalize(rawBBox)

  const size = bbox.size()
  const scale = ceil(max(size.x, size.y))
  const center = bbox.center()

  const tint = color ? util.mix_color(color, outlineTint as Color) : outlineTint

  const iconScale = 0.5 * min(size.x, size.y)
  const iconSprite = icon && iconToSprite(icon, iconScale)

  const { x, y } = bbox.scale(32 / scale).size()
  function createRotated(dir: defines.direction | nil): Sprite {
    const isRotated90 = dir === direction.east || dir === direction.west
    const baseValue: Sprite = {
      filename: whiteTile,
      width: isRotated90 ? y : x,
      height: isRotated90 ? x : y,
      scale,
      shift: center.rotateAboutOrigin(dir),
      priority: "extra-high",
      tint,
    }
    if (iconSprite) {
      return { layers: [baseValue, iconSprite] }
    }
    return baseValue
  }

  if (bbox.isCenteredSquare()) return createRotated(direction.north)
  return {
    north: createRotated(direction.north),
    east: createRotated(direction.east),
    south: createRotated(direction.south),
    west: createRotated(direction.west),
  }
}

const entityToItemBuild = new LuaMap<string, string>()
for (const [name, itemPrototype] of pairs<Record<string, ItemPrototype>>(data.raw.item)) {
  if (itemPrototype.place_result) entityToItemBuild.set(itemPrototype.place_result, name)
}

const utilityConstants: UtilityConstants = data.raw["utility-constants"].default

const flagsToTransfer = newLuaSet<keyof EntityPrototypeFlags>("placeable-off-grid", "building-direction-8-way")
function isBuildablePrototype(prototype: EntityPrototype): boolean {
  const flags = prototype.flags
  if (!flags || !flags.includes("player-creation")) return false
  return prototype.selection_box !== nil
}

const previews: SimpleEntityWithOwnerPrototype[] = []
// simple-entity-with-owner is used instead of simple-entity so that it can be rotated 4 ways
for (const type of keys<typeof BuildableEntityTypes>()) {
  const prototypes = data.raw[type]
  if (!prototypes) continue
  for (const [name, prototype] of pairs<Record<string, EntityPrototype>>(prototypes)) {
    if (!isBuildablePrototype(prototype)) continue

    let placeableBy = prototype.placeable_by
    if (!placeableBy) {
      const itemToBuild = entityToItemBuild.get(name)
      if (itemToBuild) placeableBy = { item: itemToBuild, count: 1 }
    }

    const flags = prototype.flags!.filter((flag) => flagsToTransfer.has(flag))
    flags.push("hidden")
    if (prototype.friendly_map_color) {
      debugPrint(name, "has friendly_map_color", prototype.friendly_map_color)
    }

    const color =
      prototype.friendly_map_color ??
      prototype.map_color ??
      utilityConstants.chart.default_friendly_color_by_type[type] ??
      utilityConstants.chart.default_friendly_color

    const selectionBox = prototype.selection_box ?? [
      [-0.5, -0.5],
      [0.5, 0.5],
    ]

    previews.push({
      name: Prototypes.PreviewEntityPrefix + name,
      type: "simple-entity-with-owner",
      localised_name: [L_Bp3.PreviewEntity, ["entity-name." + name]],

      // copied from prototype
      icons: prototype.icons,
      icon_size: prototype.icon_size,
      icon_mipmaps: prototype.icon_mipmaps,
      icon: prototype.icon,

      selection_box: selectionBox,
      collision_box: prototype.collision_box,
      tile_height: prototype.tile_height,
      tile_width: prototype.tile_width,

      open_sound: prototype.open_sound,
      close_sound: prototype.close_sound,

      picture: createWhiteSprite(selectionBox!, color, {
        icon: prototype.icon,
        icons: prototype.icons,
        icon_size: prototype.icon_size,
        icon_mipmaps: prototype.icon_mipmaps,
      }),

      // other
      flags,
      placeable_by: placeableBy,
      collision_mask: ["resource-layer"],
      render_layer: "floor",
      create_ghost_on_death: false,
    })
  }
}

data.extend(previews)

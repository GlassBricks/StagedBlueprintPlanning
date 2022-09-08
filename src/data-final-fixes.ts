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

import { keys } from "ts-transformer-keys"
import { Data } from "typed-factorio/data/types"
import * as util from "util"
import { BuildableEntityTypes, Prototypes } from "./constants"
import {
  EntityPrototype,
  SelectionToolPrototype,
  SimpleEntityWithOwnerPrototype,
  Sprite,
  Sprite4Way,
  UtilityConstants,
} from "./declarations/data"
import { BBox } from "./lib/geometry"
import { L_Bp100 } from "./locale"
import direction = defines.direction
import ceil = math.ceil
import max = math.max

declare const data: Data

const whiteTile = "__base__/graphics/terrain/lab-tiles/lab-white.png"
const outlineTint: ColorArray = [0.5, 0.5, 0.5]
export function createWhiteSprite(
  rawBBox: BoundingBoxWrite | BoundingBoxArray,
  color: Color | nil,
): Sprite | Sprite4Way {
  const bbox = BBox.normalize(rawBBox)

  const size = bbox.size()
  const scale = ceil(max(size.x, size.y))
  const center = bbox.center()

  const tint = color ? util.mix_color(color, outlineTint as Color) : outlineTint

  const { x, y } = bbox.scale(32 / scale).size()
  function createRotated(dir: defines.direction | nil): Sprite {
    const isRotated90 = dir === direction.east || dir === direction.west
    return {
      filename: whiteTile,
      width: isRotated90 ? y : x,
      height: isRotated90 ? x : y,
      scale,
      shift: center.rotateAboutOrigin(dir),
      priority: "extra-high",
      flags: ["terrain"],
      tint,
    }
  }

  if (bbox.isCenteredSquare()) return createRotated(direction.north)
  return {
    north: createRotated(direction.north),
    east: createRotated(direction.east),
    south: createRotated(direction.south),
    west: createRotated(direction.west),
  }
}

const emptySprite: Sprite = {
  filename: "__core__/graphics/empty.png",
  size: 1,
  priority: "extra-high",
  tint: [1, 1, 1, 1],
}

const entityToItemBuild = new LuaMap<string, string>()
const itemTypes = ["item", "item-with-entity-data", "rail-planner"]
for (const type of itemTypes) {
  const prototypes = data.raw[type]
  if (prototypes === nil) continue
  for (const [name, itemPrototype] of pairs(prototypes)) {
    if (itemPrototype.place_result) entityToItemBuild.set(itemPrototype.place_result, name)
  }
}
const utilityConstants: UtilityConstants = data.raw["utility-constants"].default

const flagsToTransfer = newLuaSet<keyof EntityPrototypeFlags>("placeable-off-grid", "building-direction-8-way")
function isBuildablePrototype(prototype: EntityPrototype): boolean {
  const flags = prototype.flags
  if (!flags || !flags.includes("player-creation")) return false
  return prototype.selection_box !== nil
}

const previews: SimpleEntityWithOwnerPrototype[] = []
const selectionProxies: SimpleEntityWithOwnerPrototype[] = []
for (const [, type] of ipairs(keys<typeof BuildableEntityTypes>())) {
  const prototypes = data.raw[type]
  if (!prototypes) continue
  for (const [name, prototype] of pairs<Record<string, EntityPrototype>>(prototypes)) {
    if (!isBuildablePrototype(prototype)) continue

    let placeableBy = prototype.placeable_by
    if (!placeableBy) {
      const itemToBuild = entityToItemBuild.get(name)
      if (itemToBuild) placeableBy = { item: itemToBuild, count: 1 }
    }
    if (!placeableBy) continue

    const flags = prototype.flags!.filter((flag) => flagsToTransfer.has(flag))
    flags.push("hidden")
    flags.push("not-on-map")

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
      localised_name: [L_Bp100.PreviewEntity, ["entity-name." + name]],

      // copied from prototype
      icons: prototype.icons,
      icon_size: prototype.icon_size,
      icon_mipmaps: prototype.icon_mipmaps,
      icon: prototype.icon,

      selection_box: selectionBox,
      collision_box: prototype.collision_box,
      tile_height: prototype.tile_height,
      tile_width: prototype.tile_width,

      collision_mask: [],

      open_sound: prototype.open_sound,
      close_sound: prototype.close_sound,

      picture: createWhiteSprite(selectionBox!, color),

      // other
      flags,
      placeable_by: placeableBy,
      render_layer: "floor",
      subgroup: Prototypes.PreviewEntitySubgroup,
      create_ghost_on_death: false,
    })

    selectionProxies.push({
      name: Prototypes.SelectionProxyPrefix + name,
      type: "simple-entity-with-owner",
      localised_name: [L_Bp100.SelectionProxy, ["entity-name." + name]],

      // copied from prototype
      icons: prototype.icons,
      icon_size: prototype.icon_size,
      icon_mipmaps: prototype.icon_mipmaps,
      icon: prototype.icon,

      selection_box: selectionBox,
      collision_box: prototype.collision_box,
      tile_height: prototype.tile_height,
      tile_width: prototype.tile_width,

      collision_mask: [],

      picture: emptySprite,
      flags,
      selectable_in_game: false,
      subgroup: Prototypes.SelectionProxySubgroup,
    })
  }
}

data.extend(previews)
data.extend(selectionProxies)

const selectionProxyNames = selectionProxies.map((proxy) => proxy.name)

const cleanupTool: SelectionToolPrototype = data.raw["selection-tool"][Prototypes.CleanupTool]
cleanupTool.entity_filters = cleanupTool.alt_entity_filters = selectionProxyNames

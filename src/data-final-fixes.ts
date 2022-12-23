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

import { Data } from "typed-factorio/data/types"
import * as util from "util"
import { empty_sprite } from "util"
import { BuildableEntityType, Prototypes } from "./constants"
import {
  BasicSprite,
  EntityPrototype,
  ItemToPlace,
  RailPieceLayers,
  RailRemnantsPrototype,
  SelectionToolPrototype,
  SimpleEntityWithOwnerPrototype,
  Sprite,
  Sprite4Way,
  UtilityConstants,
} from "./declarations/data"
import { BBox } from "./lib/geometry"
import { L_Bp100 } from "./locale"
import { emptySprite16 } from "./data-util"
import direction = defines.direction
import ceil = math.ceil
import max = math.max

declare const data: Data

const whiteTile = "__base__/graphics/terrain/lab-tiles/lab-white.png"
const previewTint: ColorArray = [0.5, 0.5, 0.5, 0.8]
function getPreviewTint(color: Color | nil): ColorArray {
  return color ? util.mix_color(color, previewTint as Color) : previewTint
}
export function createWhiteSprite(
  rawBBox: BoundingBoxWrite | BoundingBoxArray,
  color: Color | nil,
): Sprite | Sprite4Way {
  let bbox = BBox.normalize(rawBBox)

  let size = bbox.size()
  let scale = ceil(max(size.x, size.y))
  if (scale == 0) return empty_sprite() as Sprite

  if (scale > 32) {
    // scale dimensions so it fits in 32x32
    let scaleX = 1
    let scaleY = 1
    if (ceil(size.x) > 32) {
      scaleX = 32 / ceil(size.x)
    }
    if (ceil(size.y) > 32) {
      scaleY = 32 / ceil(size.y)
    }
    bbox = bbox.scaleXY(scaleX, scaleY)
    size = bbox.size()
    scale = ceil(max(size.x, size.y))
  }

  const { x, y } = bbox.scale(32 / scale).size()
  const center = bbox.center()

  function createRotated(dir: defines.direction | nil): Sprite {
    const isRotated90 = dir == direction.east || dir == direction.west
    return {
      filename: whiteTile,
      width: isRotated90 ? y : x,
      height: isRotated90 ? x : y,
      scale,
      shift: center.rotateAboutOrigin(dir),
      priority: "extra-high",
      flags: ["group=none"],
      tint: getPreviewTint(color),
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

const entityToItemBuild = new LuaMap<string, string>()
const itemTypes = ["item", "item-with-entity-data", "rail-planner"]
for (const type of itemTypes) {
  const prototypes = data.raw[type]
  if (prototypes == nil) continue
  for (const [name, itemPrototype] of pairs(prototypes)) {
    if (itemPrototype.place_result) entityToItemBuild.set(itemPrototype.place_result, name)
  }
}
const utilityConstants: UtilityConstants = data.raw["utility-constants"].default

const flagsToTransfer = newLuaSet<keyof EntityPrototypeFlags>("placeable-off-grid", "building-direction-8-way")
function isBuildablePrototype(prototype: EntityPrototype): boolean {
  const flags = prototype.flags
  if (!flags || !flags.includes("player-creation")) return false
  return prototype.selection_box != nil
}
const rollingStockTypes: ReadonlyLuaSet<string> = newLuaSet(
  "artillery-wagon",
  "cargo-wagon",
  "fluid-wagon",
  "locomotive",
)

const railPrototypes = newLuaSet("straight-rail", "curved-rail")
const previews: EntityPrototype[] = []
const types = keys<Record<BuildableEntityType, true>>()

const buildableNonRollingStockNames: string[] = []

for (const type of types.sort()) {
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

    let selectionBox = prototype.selection_box ?? [
      [-0.5, -0.5],
      [0.5, 0.5],
    ]

    if (rollingStockTypes.has(type)) {
      selectionBox = BBox.expand(BBox.normalize(selectionBox), 0.3)
    } else {
      buildableNonRollingStockNames.push(name)
    }

    const isRail = railPrototypes.has(type)
    if (isRail) {
      previews.push(createRailPreview(prototype, placeableBy, flags))
    } else {
      const color =
        prototype.friendly_map_color ??
        prototype.map_color ??
        utilityConstants.chart.default_friendly_color_by_type[type] ??
        utilityConstants.chart.default_friendly_color

      const preview: SimpleEntityWithOwnerPrototype = {
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

        picture: createWhiteSprite(selectionBox, color),

        // other
        flags,
        placeable_by: placeableBy,
        render_layer: "ground-patch-higher2",
        secondary_draw_order: 100,
        subgroup: Prototypes.PreviewEntitySubgroup,
        create_ghost_on_death: false,
      }
      previews.push(preview)
    }
  }
}

function spriteToRailPieceLayers(sprite: BasicSprite): RailPieceLayers {
  return {
    metals: emptySprite16,
    backplates: emptySprite16,
    ties: emptySprite16,
    stone_path: sprite,
  }
}
function getCurvedRailSprite(pos: MapPositionArray, size: MapPositionArray, tint: ColorArray): RailPieceLayers {
  return spriteToRailPieceLayers({
    filename: "__bp100__/graphics/rails/curved-rail.png",
    priority: "extra-high",
    position: pos,
    size,
    scale: 32,
    tint,
    flags: ["group=none"],
  })
}
function getDiagonalRailSprite(n: number, tint: ColorArray): RailPieceLayers {
  return spriteToRailPieceLayers({
    filename: "__bp100__/graphics/rails/diagonal-rail.png",
    priority: "extra-high",
    position: [n * 2, 0],
    size: 2,
    scale: 32,
    tint,
    flags: ["group=none"],
  })
}
function getStraightRailSprite(tint: Color | ColorArray): RailPieceLayers {
  // use top 2x2 pixels of lab-tile
  return spriteToRailPieceLayers({
    filename: whiteTile,
    priority: "extra-high",
    size: 2,
    scale: 32,
    tint,
    flags: ["group=none"],
  })
}

function createRailPictures(color: Color): RailRemnantsPrototype["pictures"] {
  const tint = getPreviewTint(color)
  const straight = getStraightRailSprite(tint)
  return {
    straight_rail_horizontal: straight,
    straight_rail_vertical: straight,
    straight_rail_diagonal_left_top: getDiagonalRailSprite(0, tint),
    straight_rail_diagonal_right_top: getDiagonalRailSprite(1, tint),
    straight_rail_diagonal_right_bottom: getDiagonalRailSprite(2, tint),
    straight_rail_diagonal_left_bottom: getDiagonalRailSprite(3, tint),
    curved_rail_vertical_left_top: getCurvedRailSprite([0, 0], [4, 8], tint),
    curved_rail_vertical_right_top: getCurvedRailSprite([4, 0], [4, 8], tint),
    curved_rail_vertical_right_bottom: getCurvedRailSprite([8, 0], [4, 8], tint),
    curved_rail_vertical_left_bottom: getCurvedRailSprite([12, 0], [4, 8], tint),
    curved_rail_horizontal_left_top: getCurvedRailSprite([0, 8], [8, 4], tint),
    curved_rail_horizontal_right_top: getCurvedRailSprite([8, 8], [8, 4], tint),
    curved_rail_horizontal_right_bottom: getCurvedRailSprite([0, 12], [8, 4], tint),
    curved_rail_horizontal_left_bottom: getCurvedRailSprite([8, 12], [8, 4], tint),
    rail_endings: {
      sheet: emptySprite16,
    },
  }
}

function createRailPreview(
  prototype: EntityPrototype,
  placeableBy: ItemToPlace,
  flags: (keyof EntityPrototypeFlags)[],
): RailRemnantsPrototype {
  const isCurved = prototype.type == "curved-rail"
  const color = prototype.friendly_map_color ?? prototype.map_color ?? utilityConstants.chart.rail_color
  if (!flags.includes("building-direction-8-way")) {
    flags.push("building-direction-8-way")
  }

  return {
    name: Prototypes.PreviewEntityPrefix + prototype.name,
    type: "rail-remnants",
    localised_name: [L_Bp100.PreviewEntity, ["entity-name." + prototype.name]],

    bending_type: isCurved ? "turn" : "straight",

    // copied from prototype
    icons: prototype.icons,
    icon_size: prototype.icon_size,
    icon_mipmaps: prototype.icon_mipmaps,
    icon: prototype.icon,

    tile_height: prototype.tile_height,
    tile_width: prototype.tile_width,

    collision_mask: ["not-colliding-with-itself"],
    collision_box: prototype.collision_box,
    secondary_collision_box: isCurved
      ? [
          [-0.65, -2.43],
          [0.65, 2.43],
        ]
      : nil,

    open_sound: prototype.open_sound,
    close_sound: prototype.close_sound,

    pictures: createRailPictures(color),
    // int max
    time_before_removed: 2147483647,
    remove_on_tile_placement: false,
    remove_on_entity_placement: false,

    flags,
    placeable_by: placeableBy,
    final_render_layer: "ground-patch-higher2",
    subgroup: Prototypes.PreviewEntitySubgroup,
  }
}

data.extend(previews)

const previewNames = previews.map((proxy) => proxy.name)
const cleanupTool: SelectionToolPrototype = data.raw["selection-tool"][Prototypes.CleanupTool]
cleanupTool.entity_filters = cleanupTool.alt_entity_filters = cleanupTool.reverse_entity_filters = previewNames

const stageMoveTool: SelectionToolPrototype = data.raw["selection-tool"][Prototypes.StageMoveTool]
const altFilters = [...previewNames, ...buildableNonRollingStockNames]
stageMoveTool.alt_entity_filters = altFilters
stageMoveTool.reverse_entity_filters = altFilters

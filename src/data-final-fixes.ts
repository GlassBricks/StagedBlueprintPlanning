// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { AnyPrototype, PrototypeData } from "factorio:common"
import {
  BoundingBox,
  Color,
  EntityPrototype,
  PrototypeType,
  SelectionModeData,
  SelectionToolPrototype,
  SimpleEntityWithOwnerPrototype,
  Sprite,
  Sprite4Way,
} from "factorio:prototype"
import { EntityPrototypeFlags } from "factorio:runtime"
import * as util from "util"
import { empty_sprite } from "util"
import { BuildableEntityType, Prototypes } from "./constants"
import { BBox } from "./lib/geometry"
import { L_Bp100 } from "./locale"
import direction = defines.direction
import ceil = math.ceil
import max = math.max

declare const data: PrototypeData

const whiteTile = "__base__/graphics/terrain/lab-tiles/lab-white.png"
const previewTint: Color = [0.5, 0.5, 0.5, 0.8]
function getPreviewTint(color: Color | nil): Color {
  return color ? util.mix_color(color, previewTint) : previewTint
}
export function createWhiteSprite(rawBBox: BoundingBox, color: Color | nil): Sprite | Sprite4Way {
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
      shift: center.rotateAboutOrigin(dir).asArray(),
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
for (const type in defines.prototypes.item) {
  const prototypes = data.raw[type as keyof typeof defines.prototypes.item]
  if (prototypes == nil) continue
  for (const [name, itemPrototype] of pairs(prototypes)) {
    if (itemPrototype.place_result) entityToItemBuild.set(itemPrototype.place_result, name)
  }
}
const utilityConstants = data.raw["utility-constants"].default!

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

const previews: EntityPrototype[] = []
const types = keys<Record<BuildableEntityType, true>>()

const buildableNames: string[] = []

const problematic_rails = newLuaSet<PrototypeType>(
  "curved-rail-a",
  "curved-rail-b",
  "half-diagonal-rail",
  "straight-rail",
  "elevated-curved-rail-a",
  "elevated-curved-rail-b",
  "elevated-half-diagonal-rail",
  "elevated-straight-rail",
  "rail-support",
)

for (const type of types.sort()) {
  const prototypes = data.raw[type]
  if (!prototypes) continue
  for (const [name, prototype] of pairs(prototypes)) {
    if (!isBuildablePrototype(prototype)) continue
    buildableNames.push(name)

    let placeableBy = prototype.placeable_by
    if (!placeableBy) {
      const itemToBuild = entityToItemBuild.get(name)
      if (itemToBuild) placeableBy = { item: itemToBuild, count: 1 }
    }
    if (!placeableBy) continue

    const flags = prototype.flags!.filter((flag) => flagsToTransfer.has(flag))
    flags.push("not-on-map")
    // hack for curved rails
    if (problematic_rails.has(name as never)) {
      if (!flags.includes("placeable-off-grid")) flags.push("placeable-off-grid")
    }

    let selectionBox: BoundingBox = prototype.selection_box ?? [
      [-0.5, -0.5],
      [0.5, 0.5],
    ]

    if (rollingStockTypes.has(type)) {
      selectionBox = BBox.expand(BBox.normalize(selectionBox), 0.3).asArray()
    }

    const color =
      prototype.friendly_map_color ??
      prototype.map_color ??
      utilityConstants.chart.default_friendly_color_by_type![type] ??
      utilityConstants.chart.default_friendly_color
    const preview: SimpleEntityWithOwnerPrototype = {
      name: Prototypes.PreviewEntityPrefix + name,
      type: "simple-entity-with-owner",
      localised_name: [L_Bp100.PreviewEntity, ["entity-name." + name]],

      // copied from prototype
      icons: prototype.icons,
      icon_size: prototype.icon_size,
      icon: prototype.icon,

      selection_box: selectionBox,
      collision_box: prototype.collision_box,
      tile_height: prototype.tile_height,
      tile_width: prototype.tile_width,
      build_grid_size: prototype.build_grid_size,

      collision_mask: {
        layers: {},
      },

      open_sound: prototype.open_sound,
      close_sound: prototype.close_sound,

      picture: createWhiteSprite(selectionBox, color) as Sprite,

      // other
      flags,
      placeable_by: placeableBy,
      render_layer: "ground-patch-higher2",
      secondary_draw_order: 10,
      selection_priority: 20,
      subgroup: Prototypes.PreviewEntitySubgroup,
      create_ghost_on_death: false,
    }
    previews.push(preview)
  }
}

data.extend(previews as AnyPrototype[])

const previewNames = previews.map((preview) => preview.name)
const entityOrPreviewNames = [...buildableNames, ...previewNames]

const cleanupTool = data.raw["selection-tool"][Prototypes.CleanupTool]!
const stageMoveTool = data.raw["selection-tool"][Prototypes.StageMoveTool]!
const stagedCopyTool = data.raw["selection-tool"][Prototypes.StagedCopyTool]!
const stagedCutTool = data.raw["selection-tool"][Prototypes.StagedCutTool]!
const forceDeleteTool = data.raw["selection-tool"][Prototypes.ForceDeleteTool]!

function setEntityFilters(
  tool: SelectionToolPrototype,
  key: "select" | "alt_select" | "reverse_select" | "alt_reverse_select",
  filters: string[],
): void {
  tool[key] = {
    ...(tool[key] as SelectionModeData),
    entity_filters: filters,
  }
}
setEntityFilters(cleanupTool, "select", previewNames)
setEntityFilters(cleanupTool, "alt_select", previewNames)
setEntityFilters(cleanupTool, "reverse_select", previewNames)

setEntityFilters(stageMoveTool, "select", buildableNames)
setEntityFilters(stageMoveTool, "alt_select", entityOrPreviewNames)
setEntityFilters(stageMoveTool, "reverse_select", entityOrPreviewNames)
setEntityFilters(stageMoveTool, "alt_reverse_select", previewNames)

setEntityFilters(stagedCopyTool, "select", buildableNames)
setEntityFilters(stagedCopyTool, "alt_select", buildableNames)
setEntityFilters(stagedCutTool, "select", buildableNames)
setEntityFilters(stagedCutTool, "alt_select", buildableNames)

setEntityFilters(forceDeleteTool, "select", buildableNames)
setEntityFilters(forceDeleteTool, "alt_select", entityOrPreviewNames)

const twoDirectionOnlyTanks: string[] = []
for (const [name, tank] of pairs(data.raw["storage-tank"])) {
  if (tank.two_direction_only) {
    twoDirectionOnlyTanks.push(name)
  }
}

data.extend<SelectionToolPrototype>([
  {
    name: Prototypes.PassedPrototypeInfo,
    type: "selection-tool",
    hidden: true,
    icon: empty_sprite().filename,
    icon_size: 1,
    stack_size: 1,
    select: {
      mode: ["any-entity"],
      border_color: [0, 0, 0],
      cursor_box_type: "entity",
      entity_filters: twoDirectionOnlyTanks,
    },
    alt_select: {
      mode: ["any-entity"],
      border_color: [0, 0, 0],
      cursor_box_type: "entity",
    },
  },
])

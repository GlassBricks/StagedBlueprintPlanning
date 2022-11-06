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

import { isEmpty, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"

export interface BlueprintSettings {
  name: string
  icons: BlueprintSignalIcon[] | nil

  /** Original position + offset = blueprint position */
  positionOffset: Position
  snapToGrid?: Position
  positionRelativeToGrid?: Position
  absoluteSnapping: boolean
}
export interface BlueprintTransformations {
  entityFilters?: LuaSet<string>
  entityFilterMode?: defines.deconstruction_item.entity_filter_mode
}

export function getDefaultBlueprintSettings(): BlueprintSettings {
  return {
    name: "",
    icons: nil,
    positionOffset: { x: 0, y: 0 },
    absoluteSnapping: false,
  }
}
export const FirstEntityOriginalPositionTag = "bp100:FirstEntityOriginalPosition"
/**
 * If forEdit is true, sets the first entity's original position tag.
 */
export function takeBlueprintWithSettings(
  stack: LuaItemStack,
  settings: BlueprintSettings,
  transform: BlueprintTransformations,
  surface: LuaSurface,
  bbox: BBox,
  forEdit: boolean,
): boolean {
  if (!stack.is_blueprint) {
    stack.set_stack("blueprint")
  }

  const bpMapping = stack.create_blueprint({
    surface,
    force: "player",
    area: bbox,
    include_trains: true,
    include_station_names: true,
    always_include_tiles: true,
  })

  if (isEmpty(bpMapping)) return false

  const firstEntityOriginalPosition = bpMapping[1].position
  if (settings.snapToGrid != nil || transform.entityFilters) {
    const entities = stack.get_blueprint_entities()!
    const firstEntityPosition = entities[0].position
    const expectedPosition = Pos.plus(firstEntityOriginalPosition, settings.positionOffset)
    const shouldAdjustPosition = !Pos.equals(firstEntityPosition, expectedPosition)
    if (shouldAdjustPosition) {
      const { x, y } = Pos.minus(expectedPosition, firstEntityPosition)
      for (const i of $range(1, entities.length)) {
        const entity = entities[i - 1]
        const pos = entity.position as Mutable<Position>
        pos.x += x
        pos.y += y
      }
    }
    const filters = transform.entityFilters
    if (filters) {
      const isWhitelist = transform.entityFilterMode == defines.deconstruction_item.entity_filter_mode.whitelist
      for (const i of $range(1, entities.length)) {
        const entity = entities[i - 1]
        const shouldRemove = isWhitelist != filters.has(entity.name)
        if (shouldRemove) delete entities[i - 1]
      }
    }
    if (filters || shouldAdjustPosition) {
      stack.set_blueprint_entities(entities)
    }
  }

  stack.label = settings.name
  stack.blueprint_icons = settings.icons ?? (stack.default_icons as unknown as BlueprintSignalIcon[])
  stack.blueprint_snap_to_grid = settings.snapToGrid
  stack.blueprint_absolute_snapping = settings.absoluteSnapping
  stack.blueprint_position_relative_to_grid = settings.positionRelativeToGrid

  if (forEdit) {
    stack.set_blueprint_entity_tag(1, FirstEntityOriginalPositionTag, firstEntityOriginalPosition)
  }
  return true
}

export function tryTakeBlueprintWithSettings(
  stack: LuaItemStack,
  settings: BlueprintSettings,
  transform: BlueprintTransformations,
  surface: LuaSurface,
  bbox: BBox,
): boolean {
  return takeBlueprintWithSettings(stack, settings, transform, surface, bbox, false)
}

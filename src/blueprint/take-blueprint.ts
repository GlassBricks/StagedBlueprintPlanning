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

import { getInfinityEntityNames } from "../entity/entity-info"
import { isEmpty, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { StageBlueprintSettings } from "./blueprint-settings"
import entity_filter_mode = defines.deconstruction_item.entity_filter_mode

export const FirstEntityOriginalPositionTag = "bp100:FirstEntityOriginalPosition"
function adjustEntitiesToMatchPositionOffset(
  stack: LuaItemStack,
  entities: BlueprintEntity[],
  positionOffset: Position | nil,
  firstEntityOriginalPosition: MapPosition,
): boolean {
  if (!positionOffset) return false
  const firstEntityPosition = entities[0].position
  const expectedPosition = Pos.plus(firstEntityOriginalPosition, positionOffset)
  const shouldAdjustPosition = !Pos.equals(firstEntityPosition, expectedPosition)
  if (shouldAdjustPosition) {
    const { x, y } = Pos.minus(expectedPosition, firstEntityPosition)
    for (const i of $range(1, entities.length)) {
      const pos = entities[i - 1].position as Mutable<Position>
      pos.x += x
      pos.y += y
    }
    const tiles = stack.get_blueprint_tiles()!
    if (tiles && tiles.length > 0) {
      for (const i of $range(1, tiles.length)) {
        const pos = tiles[i - 1].position as Mutable<Position>
        pos.x += x
        pos.y += y
      }
      stack.set_blueprint_tiles(tiles)
    }
  }
  return shouldAdjustPosition
}
function replaceInfinityEntitiesWithCombinators(entities: BlueprintEntity[]): void {
  const [chests, pipes] = getInfinityEntityNames()
  for (const i of $range(1, entities.length)) {
    const entity = entities[i - 1] as Mutable<BlueprintEntity>
    const name = entity.name
    if (chests.has(name)) {
      const infinityFilters = (entity.infinity_settings as BlueprintInfinitySettings)?.filters
      entity.name = "constant-combinator"
      entity.control_behavior = {
        filters:
          infinityFilters &&
          infinityFilters.map((f) => ({
            index: f.index,
            count: f.count ?? 1,
            signal: { type: "item", name: f.name },
          })),
      }
      entity.infinity_settings = nil
    } else if (pipes.has(name)) {
      const settings = entity.infinity_settings as InfinityPipeFilter | nil
      entity.name = "constant-combinator"
      entity.control_behavior = {
        filters: settings && [
          {
            index: 1,
            count: math.ceil((settings.percentage ?? 0.01) * 100),
            signal: { type: "fluid", name: settings.name },
          },
        ],
      }
    }
  }
}
function filterEntities(
  entities: BlueprintEntity[],
  filters: LuaSet<string>,
  mode: defines.deconstruction_item.entity_filter_mode | nil,
): void {
  const isWhitelist = mode != entity_filter_mode.blacklist
  for (const i of $range(1, entities.length)) {
    const entity = entities[i - 1]
    if (isWhitelist != filters.has(entity.name)) delete entities[i - 1]
  }
}

/**
 * If forEdit is true, sets the first entity's original position tag.
 */
export function takeBlueprintWithSettings(
  stack: LuaItemStack,
  settings: StageBlueprintSettings,
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

  const { additionalWhitelist } = settings
  const entitiesPossiblyAltered = additionalWhitelist != nil

  if (settings.snapToGrid != nil || entitiesPossiblyAltered) {
    const entities = stack.get_blueprint_entities()!
    const shouldAdjustPosition = adjustEntitiesToMatchPositionOffset(
      stack,
      entities,
      settings.positionOffset,
      bpMapping[1].position,
    )

    if (isEmpty(entities)) {
      stack.clear_blueprint()
      return false
    }

    if (entitiesPossiblyAltered || shouldAdjustPosition) {
      stack.set_blueprint_entities(entities)
    }
  }

  stack.blueprint_icons = settings.icons ?? (stack.default_icons as unknown as BlueprintSignalIcon[])
  stack.blueprint_snap_to_grid = settings.snapToGrid
  stack.blueprint_absolute_snapping = settings.absoluteSnapping
  stack.blueprint_position_relative_to_grid = settings.positionRelativeToGrid

  if (forEdit) {
    stack.set_blueprint_entity_tag(1, FirstEntityOriginalPositionTag, bpMapping[1].position)
  }
  return true
}

export function tryTakeBlueprintWithSettings(
  stack: LuaItemStack,
  settings: StageBlueprintSettings,
  surface: LuaSurface,
  bbox: BBox,
): boolean {
  return takeBlueprintWithSettings(stack, settings, surface, bbox, false)
}
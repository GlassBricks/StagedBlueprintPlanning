/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { getInfinityEntityNames } from "../entity/entity-prototype-info"
import { isEmpty, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { BlueprintTakeParameters } from "./blueprint-settings"

export const FirstEntityOriginalPositionTag = "bp100:FirstEntityOriginalPosition"
function adjustEntitiesToMatchPositionOffset(
  stack: LuaItemStack,
  entities: BlueprintEntity[],
  positionOffset: Position,
  firstEntityOriginalPosition: MapPosition,
): boolean {
  const firstEntityPosition = entities[0].position
  const expectedPosition = Pos.plus(firstEntityOriginalPosition, positionOffset)
  const shouldAdjustPosition = !Pos.equals(firstEntityPosition, expectedPosition)
  if (!shouldAdjustPosition) return false

  const { x, y } = Pos.minus(expectedPosition, firstEntityPosition)
  for (const i of $range(1, entities.length)) {
    const pos = entities[i - 1].position as Mutable<Position>
    pos.x += x
    pos.y += y
  }
  const tiles = stack.get_blueprint_tiles()
  if (tiles) {
    for (const i of $range(1, tiles.length)) {
      const pos = tiles[i - 1].position as Mutable<Position>
      pos.x += x
      pos.y += y
    }
    stack.set_blueprint_tiles(tiles)
  }
  return true
}

function getEffectivePositionOffset(entities: BlueprintEntity[], firstEntityOriginalPosition: MapPosition): Position {
  return Pos.minus(entities[0].position, firstEntityOriginalPosition)
}

function filterEntities(
  entities: BlueprintEntity[],
  unitNumbers: ReadonlyLuaSet<UnitNumber> | nil,
  bpMapping: Record<number, LuaEntity>,
  additionalWhitelist: ReadonlyLuaSet<string>,
  blacklist: ReadonlyLuaSet<string>,
): boolean {
  let anyDeleted = false
  for (const i of $range(1, entities.length)) {
    const entity = entities[i - 1]

    // not blacklist, and (no unitNumbers or (in whitelist or in unitNumbers))
    const name = entity.name
    if (!blacklist.has(name)) {
      if (!unitNumbers || additionalWhitelist.has(name)) continue
      const unitNumber = bpMapping[i].unit_number
      if (unitNumber && unitNumbers.has(unitNumber)) continue
    }

    delete entities[i - 1]
    anyDeleted = true
  }
  return anyDeleted
}

function replaceInfinityEntitiesWithCombinators(entities: Record<number, Mutable<BlueprintEntity>>): boolean {
  let anyReplaced = false
  const [chests, pipes] = getInfinityEntityNames()
  for (const [, entity] of pairs(entities)) {
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
      anyReplaced = true
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
    anyReplaced = true
  }
  return anyReplaced
}

export interface BlueprintTakeResult {
  effectivePositionOffset: Position
}

function contains2x2Grid(bp: BlueprintItemStack): boolean {
  bp.blueprint_snap_to_grid = [1, 1]
  const { x, y } = bp.blueprint_snap_to_grid!
  return x == 2 && y == 2
}

function posIsOdd(pos: Position): boolean {
  return pos.x % 2 == 1 || pos.y % 2 == 1
}

function alignPosTo2x2(pos: Position, isOdd: boolean): Position {
  const rem = isOdd ? 1 : 0
  return {
    x: math.floor(pos.x / 2) * 2 + rem,
    y: math.floor(pos.y / 2) * 2 + rem,
  }
}

/**
 * If forEdit is true, sets the first entity's original position tag.
 */
export function takeSingleBlueprint(
  stack: LuaItemStack,
  params: BlueprintTakeParameters,
  surface: LuaSurface,
  bbox: BBox,
  unitNumberFilter: ReadonlyLuaSet<UnitNumber> | nil,
  forEdit: boolean,
): BlueprintTakeResult | nil {
  stack.set_stack("blueprint")
  stack.clear_blueprint()
  const bpMapping = stack.create_blueprint({
    surface,
    force: "player",
    area: bbox,
    include_trains: true,
    include_station_names: true,
    always_include_tiles: true,
  })

  if (isEmpty(bpMapping)) return nil

  const {
    snapToGrid,
    additionalWhitelist,
    blacklist,
    replaceInfinityEntitiesWithCombinators: shouldReplaceInfinity,
    absoluteSnapping,
  } = params

  let { positionOffset, positionRelativeToGrid } = params

  const entities: BlueprintEntity[] = stack.get_blueprint_entities()!

  let effectivePositionOffset: Position | nil
  let entitiesAdjusted = false
  const firstEntityOriginalPosition = bpMapping[1].position

  if (snapToGrid && positionOffset) {
    if (contains2x2Grid(stack)) {
      const isOddGrid =
        params.absoluteSnapping != nil && positionRelativeToGrid != nil && posIsOdd(positionRelativeToGrid)
      positionOffset = alignPosTo2x2(positionOffset, isOddGrid)
      if (positionRelativeToGrid) positionRelativeToGrid = alignPosTo2x2(positionRelativeToGrid, isOddGrid)
    }

    if (adjustEntitiesToMatchPositionOffset(stack, entities, positionOffset, firstEntityOriginalPosition))
      entitiesAdjusted = true
    effectivePositionOffset = positionOffset
  } else {
    effectivePositionOffset = getEffectivePositionOffset(entities, firstEntityOriginalPosition)
  }

  if (unitNumberFilter || blacklist) {
    if (
      filterEntities(
        entities,
        unitNumberFilter,
        bpMapping,
        additionalWhitelist ?? newLuaSet(),
        blacklist ?? newLuaSet(),
      )
    ) {
      entitiesAdjusted = true
    }
  }

  if (shouldReplaceInfinity && replaceInfinityEntitiesWithCombinators(entities)) {
    entitiesAdjusted = true
  }

  if (isEmpty(entities)) {
    stack.clear_blueprint()
    return nil
  }

  stack.blueprint_snap_to_grid = snapToGrid
  stack.blueprint_absolute_snapping = absoluteSnapping
  if (absoluteSnapping) {
    stack.blueprint_position_relative_to_grid = positionRelativeToGrid
  }

  if (entitiesAdjusted) {
    stack.set_blueprint_entities(entities)
  }

  stack.blueprint_icons = params.icons ?? (stack.default_icons as unknown as BlueprintSignalIcon[])
  if (forEdit) {
    stack.set_blueprint_entity_tag(1, FirstEntityOriginalPositionTag, firstEntityOriginalPosition)
  }
  return {
    effectivePositionOffset,
  }
}

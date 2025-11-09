// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { BlueprintEntity, LuaEntity, LuaItemStack, LuaSurface, MapPosition, UnitNumber } from "factorio:runtime"
import { UnstagedEntityProps } from "../entity/Entity"
import { addItemRequests, filterOutInventories, getInventoriesFromRequests } from "../entity/item-requests"
import { isEmpty, Mutable, PRecord } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { BlueprintTakeSettings, getIconsFromSettings } from "./blueprint-settings"

export const FirstEntityOriginalPositionTag = "bp100_FirstEntityOriginalPosition"
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
): LuaMultiReturn<[deleted?: true, firstNotDeletedIndex?: number]> {
  let anyDeleted: true | nil
  let firstNotDeletedLuaIndex: number | nil
  let un: UnitNumber | nil
  let luaEntity: LuaEntity | nil
  for (const i of $range(1, entities.length)) {
    const entity = entities[i - 1]

    // not blacklist, and (no unitNumbers or (in whitelist or in unitNumbers))
    const name = entity.name
    if (
      blacklist.has(name) ||
      (unitNumbers &&
        !additionalWhitelist.has(name) &&
        !((luaEntity = bpMapping[i]) && (un = luaEntity.unit_number) && unitNumbers.has(un)) &&
        luaEntity.type != "entity-ghost")
    ) {
      entities[i - 1] = nil!
      anyDeleted = true
    } else {
      firstNotDeletedLuaIndex ??= i
    }
  }
  return $multi(anyDeleted, firstNotDeletedLuaIndex)
}

function contains2x2Grid(bp: LuaItemStack): boolean {
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

export interface TakeSingleBlueprintParams {
  stack: LuaItemStack
  settings: BlueprintTakeSettings
  surface: LuaSurface
  bbox: BBox
  unitNumberFilter?: ReadonlyLuaSet<UnitNumber>
  additionalSettings?: ReadonlyLuaMap<UnitNumber, UnstagedEntityProps>
  setOrigPositionTag?: boolean
  stageName?: string
}

export interface BlueprintTakeResult {
  effectivePositionOffset: Position
  entities: PRecord<number, BlueprintEntity>
  bpMapping: Record<number, LuaEntity>
}

function addItemRequestsToBlueprint(
  entities: PRecord<number, BlueprintEntity>,
  bpMapping: Record<number, LuaEntity>,
  additionalSettings: ReadonlyLuaMap<UnitNumber, UnstagedEntityProps>,
): boolean {
  let changed = false
  for (const [entityNumber, luaEntity] of pairs(bpMapping)) {
    const unitNumber = luaEntity.unit_number
    if (!unitNumber) continue
    const requests = additionalSettings.get(unitNumber)?.items
    if (!requests) continue
    const bpEntity = entities[entityNumber]
    if (!bpEntity) continue

    // exclude adding requests vanilla blueprinting already has
    let filteredRequests: typeof requests | nil = requests
    if (bpEntity.items) {
      const existingInventories = getInventoriesFromRequests(bpEntity.items)
      filteredRequests = filterOutInventories(requests, existingInventories)
    }

    if (filteredRequests != nil) {
      addItemRequests(bpEntity, filteredRequests)
      changed = true
    }
  }

  return changed
}

/**
 * If forEdit is true, sets the first entity's original position tag.
 */
export function takeSingleBlueprint({
  stack,
  settings: params,
  surface,
  bbox,
  unitNumberFilter,
  additionalSettings, // todo
  setOrigPositionTag,
  stageName,
}: TakeSingleBlueprintParams): BlueprintTakeResult | nil {
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

  const { snapToGrid, additionalWhitelist, blacklist, absoluteSnapping } = params

  let { positionOffset, positionRelativeToGrid } = params

  const entities: BlueprintEntity[] = stack.get_blueprint_entities()!

  let effectivePositionOffset: Position | nil
  let entitiesAdjusted = false
  const firstEntityOriginalPosition = bpMapping[1].position
  let finalFirstEntityOrigPosition = firstEntityOriginalPosition

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
    const [anyDeleted, firstNotDeletedIndex] = filterEntities(
      entities,
      unitNumberFilter,
      bpMapping,
      additionalWhitelist ?? newLuaSet(),
      blacklist ?? newLuaSet(),
    )
    if (anyDeleted) {
      entitiesAdjusted = true
      if (firstNotDeletedIndex == nil) {
        stack.clear_blueprint()
        return nil
      }

      finalFirstEntityOrigPosition = bpMapping[firstNotDeletedIndex].position
    }
  }

  if (additionalSettings) {
    const changed = addItemRequestsToBlueprint(entities, bpMapping, additionalSettings)
    if (changed) entitiesAdjusted = true
  }

  if (isEmpty(entities)) {
    stack.clear_blueprint()
    return nil
  }

  stack.blueprint_snap_to_grid = snapToGrid
  if (snapToGrid) {
    stack.blueprint_absolute_snapping = absoluteSnapping
    if (absoluteSnapping) {
      stack.blueprint_position_relative_to_grid = positionRelativeToGrid
    }
  }

  if (entitiesAdjusted) {
    stack.set_blueprint_entities(entities)
  }

  stack.preview_icons = getIconsFromSettings(params, stageName) ?? stack.default_icons

  if (setOrigPositionTag) {
    stack.set_blueprint_entity_tag(1, FirstEntityOriginalPositionTag, finalFirstEntityOrigPosition)
  }

  return {
    effectivePositionOffset,
    entities,
    bpMapping,
  }
}

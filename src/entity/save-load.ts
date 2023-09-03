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

import {
  BlueprintEntity,
  BlueprintItemStack,
  BoundingBox,
  LuaEntity,
  LuaInventory,
  LuaSurface,
  MapPosition
} from "factorio:runtime"
import { Events, Mutable, mutableShallowCopy } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { Entity } from "./Entity"
import {
  EntityPrototypeInfo,
  getPasteRotatableType,
  OnEntityPrototypesLoaded,
  PasteCompatibleRotationType,
  rollingStockTypes,
} from "./entity-prototype-info"
import { getUndergroundDirection } from "./underground-belt"

declare const global: {
  tempBPInventory: LuaInventory
}
Events.on_init(() => {
  global.tempBPInventory = game.create_inventory(1)
})

let bpStack: BlueprintItemStack
Migrations.since("0.17.0", () => {
  bpStack = global.tempBPInventory[0]
  bpStack.set_stack("blueprint")
})
Events.on_load(() => {
  bpStack = global.tempBPInventory[0]
})

export function getTempBpItemStack(): BlueprintItemStack {
  return bpStack
}

function findEntityIndex(mapping: Record<number, LuaEntity>, entity: LuaEntity): number | nil {
  for (const [index, mEntity] of pairs(mapping)) {
    if (entity == mEntity) return index
  }
}

export function blueprintEntity(entity: LuaEntity): Mutable<BlueprintEntity> | nil {
  const { surface, position } = entity

  for (const radius of [0.01, 1]) {
    const isRollingStock = rollingStockTypes.has(entity.type)
    const indexMapping = bpStack.create_blueprint({
      surface,
      force: entity.force,
      area: BBox.around(position, radius),
      include_station_names: true,
      include_trains: isRollingStock,
      include_fuel: isRollingStock,
    })
    const matchingIndex = findEntityIndex(indexMapping, entity)
    if (matchingIndex) {
      return bpStack.get_blueprint_entities()![matchingIndex - 1] as Mutable<BlueprintEntity>
      // assert(bpEntity.entity_number == matchingIndex)
    }
  }
}

function pasteEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction,
  entity: BlueprintEntity,
): LuaEntity | nil {
  const tilePosition = Pos.floor(position)
  const offsetPosition = Pos.minus(position, tilePosition)
  setBlueprintEntity(bpStack, entity, offsetPosition, direction)
  bpStack.blueprint_snap_to_grid = [1, 1]
  bpStack.blueprint_absolute_snapping = true

  const ghosts = bpStack.build_blueprint({
    surface,
    force: "player",
    position: tilePosition,
  })
  return ghosts[0]
}
function setBlueprintEntity(
  stack: BlueprintItemStack,
  entity: Mutable<BlueprintEntity>,
  position: Position,
  direction: defines.direction,
): void {
  // reuse the same table to avoid several allocations
  entity.position = position
  entity.direction = direction
  entity.entity_number = 1
  stack.set_blueprint_entities([entity])
  entity.position = nil!
  entity.direction = nil!
  entity.entity_number = nil!
}

function removeIntersectingItemsOnGround(surface: LuaSurface, area: BoundingBox) {
  const items = surface.find_entities_filtered({ type: "item-entity", area })
  for (const item of items) item.destroy()
}

function tryCreateUnconfiguredEntity(
  surface: LuaSurface,
  position: Position,
  direction: defines.direction,
  entity: BlueprintEntity,
): LuaEntity | nil {
  // assert(!isUndergroundBeltType(entity.name))
  const orientation = entity.orientation
  if (orientation) direction = nil!
  const params = {
    name: entity.name,
    position,
    direction,
    orientation: entity.orientation,
    type: entity.type,
    force: "player",
    create_build_effect_smoke: false,
    build_check_type: defines.build_check_type.ghost_revive,
  }
  const canPlace = surface.can_place_entity(params)
  if (canPlace) {
    return surface.create_entity(params)
  }
  params.build_check_type = defines.build_check_type.manual
  if (!surface.can_place_entity(params)) return
  const createdEntity = surface.create_entity(params)
  if (!createdEntity) return
  removeIntersectingItemsOnGround(surface, createdEntity.bounding_box)
  if (createdEntity.secondary_bounding_box)
    removeIntersectingItemsOnGround(surface, createdEntity.secondary_bounding_box)
  return createdEntity
}

let nameToType: EntityPrototypeInfo["nameToType"]
OnEntityPrototypesLoaded.addListener((info) => {
  nameToType = info.nameToType
})

const rawset = _G.rawset

function createEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction,
  entity: Entity,
): LuaEntity | nil {
  assume<BlueprintEntity>(entity)
  // assert(!isUndergroundBeltType(entity.name))
  const luaEntity = tryCreateUnconfiguredEntity(surface, position, direction, entity)
  if (!luaEntity) return nil
  // const type = luaEntity.type
  const type = nameToType.get(entity.name)!
  if (type == "underground-belt") {
    if (luaEntity.belt_to_ground_type != entity.type) {
      luaEntity.destroy()
      return nil
    }
  } else if (type == "loader" || type == "loader-1x1") {
    luaEntity.loader_type = entity.type ?? "output"
    luaEntity.direction = direction
  }
  if (entityHasSettings(entity)) {
    const ghost = pasteEntity(surface, position, direction, entity)
    if (ghost) {
      luaEntity.destroy()
      ghost.destroy()
      return nil
    }
  }
  if (entity.items) createItems(luaEntity, entity.items)

  // performance hack: cache name, type
  rawset(luaEntity, "name", entity.name)
  rawset(luaEntity, "type", type)

  return luaEntity
}

function entityHasSettings(entity: BlueprintEntity): boolean {
  for (const [key] of pairs(entity)) {
    if (key != "name" && key != "items" && key != "type") return true
  }
  return false
}

function upgradeEntity(entity: LuaEntity, name: string): LuaEntity {
  const { surface, position, direction } = entity
  entity.minable = true
  const newEntity = surface.create_entity({
    name,
    position,
    direction,
    force: "player",
    fast_replace: true,
    spill: false,
    create_build_effect_smoke: false,
    type: entity.type == "underground-belt" ? entity.belt_to_ground_type : nil,
  })
  if (!newEntity) return entity
  if (entity.valid) {
    entity.destroy()
  }
  return newEntity
}

function createItems(luaEntity: LuaEntity, items: Record<string, number>): void {
  const insertTarget = luaEntity.get_module_inventory() ?? luaEntity
  for (const [item, amount] of pairs(items)) {
    insertTarget.insert({ name: item, count: amount })
  }
}

function matchItems(luaEntity: LuaEntity, value: BlueprintEntity): void {
  const items = value.items
  const moduleInventory = luaEntity.get_module_inventory()
  if (!moduleInventory) return
  if (!items) {
    moduleInventory.clear()
    return
  }

  // clear items that don't match
  for (const [item, amount] of pairs(moduleInventory.get_contents())) {
    const expected = items[item] ?? 0
    if (amount > expected) {
      moduleInventory.remove({ name: item, count: amount - expected })
    }
  }
  // insert items that are missing
  for (const [item, amount] of pairs(items)) {
    const existing = moduleInventory.get_item_count(item)
    if (amount > existing) {
      moduleInventory.insert({ name: item, count: amount - existing })
    }
  }
  moduleInventory.sort_and_merge()
}

function updateUndergroundRotation(
  luaEntity: LuaEntity,
  value: BlueprintEntity,
  direction: defines.direction,
): LuaEntity | nil {
  if (
    getUndergroundDirection(direction, value.type) !=
    getUndergroundDirection(luaEntity.direction, luaEntity.belt_to_ground_type)
  ) {
    const surface = luaEntity.surface
    const position = luaEntity.position
    luaEntity.destroy()
    return createEntity(surface, position, direction, value)
  }
  const mode = value.type ?? "input"
  if (luaEntity.belt_to_ground_type != mode) {
    const wasRotatable = luaEntity.rotatable
    luaEntity.rotatable = true
    luaEntity.rotate()
    luaEntity.rotatable = wasRotatable
  }
  return luaEntity
}

/**
 * Position and direction are ignored.
 */
function saveEntity(entity: LuaEntity, knownValue?: BlueprintEntity): Mutable<Entity> | nil {
  const bpEntity = knownValue ? mutableShallowCopy(knownValue) : blueprintEntity(entity)
  if (!bpEntity) return nil
  bpEntity.entity_number = nil!
  bpEntity.position = nil!
  bpEntity.direction = nil
  bpEntity.neighbours = nil
  bpEntity.connections = nil
  return bpEntity
}

function updateEntity(luaEntity: LuaEntity, value: Entity, direction: defines.direction): LuaEntity | nil {
  assume<BlueprintEntity>(value)
  if (rollingStockTypes.has(luaEntity.type)) return luaEntity

  if (luaEntity.name != value.name) {
    luaEntity = upgradeEntity(luaEntity, value.name)
  }

  if (luaEntity.type == "underground-belt") {
    // underground belts don't have other settings.
    return updateUndergroundRotation(luaEntity, value, direction)
  }

  if (luaEntity.type == "loader" || luaEntity.type == "loader-1x1") {
    luaEntity.loader_type = value.type ?? "output"
  }
  luaEntity.direction = direction

  // don't paste at luaEntity.direction, because it might fail to rotate if this is an assembling machine
  const ghost = pasteEntity(luaEntity.surface, luaEntity.position, direction, value)
  if (ghost) ghost.destroy() // should not happen?
  matchItems(luaEntity, value)

  return luaEntity
}

export function makePreviewIndestructible(entity: LuaEntity | nil): void {
  if (!entity) return
  entity.destructible = false
  entity.minable = false
  entity.rotatable = false
  if (entity.type == "rail-remnants") {
    entity.corpse_expires = false
    entity.corpse_immune_to_entity_placement = true
  }
}
function createPreviewEntity(
  surface: LuaSurface,
  position: Position,
  apparentDirection: defines.direction,
  previewName: string,
): LuaEntity | nil {
  const entity = surface.create_entity({
    name: previewName,
    position,
    direction: apparentDirection,
    force: "player",
  })
  makePreviewIndestructible(entity)
  return entity
}

export { createEntity, updateEntity, createPreviewEntity, saveEntity }

// noinspection JSUnusedGlobalSymbols
export const _mockable = true

/** Currently only true if is a square assembling machine with no fluid inputs. */
export function canBeAnyDirection(luaEntity: LuaEntity): boolean {
  return (
    luaEntity.type == "assembling-machine" &&
    getPasteRotatableType(luaEntity.name) == PasteCompatibleRotationType.AnyDirection &&
    luaEntity.fluidbox.length == 0
  )
}

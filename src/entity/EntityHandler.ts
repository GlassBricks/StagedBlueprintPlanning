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

import { oppositedirection } from "util"
import { Prototypes } from "../constants"
import { Events, Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Migrations } from "../lib/migration"
import { SavedDirection } from "./AssemblyEntity"
import { Entity } from "./Entity"
import { isUndergroundBeltType, rollingStockTypes } from "./entity-info"
import { getPastedDirection, getSavedDirection, makePreviewIndestructible } from "./special-entities"

/** @noSelf */
export interface EntityCreator {
  createEntity(surface: LuaSurface, position: Position, direction: defines.direction, entity: Entity): LuaEntity | nil
  updateEntity(luaEntity: LuaEntity, value: Entity, direction: defines.direction): LuaEntity

  createPreviewEntity(
    surface: LuaSurface,
    position: Position,
    apparentDirection: defines.direction,
    entityName: string,
  ): LuaEntity | nil
}

/** @noSelf */
export interface EntitySaver {
  saveEntity(entity: LuaEntity): LuaMultiReturn<[Mutable<Entity>, SavedDirection] | []>
}

export interface EntityHandler extends EntityCreator, EntitySaver {}

declare const global: {
  tempBPInventory: LuaInventory
}
Events.on_init(() => {
  global.tempBPInventory = game.create_inventory(1)
})

export function getTempBpItemStack(): BlueprintItemStack {
  const stack = global.tempBPInventory[0]
  stack.set_stack("blueprint")
  return stack
}

function findEntityIndex(mapping: Record<number, LuaEntity>, entity: LuaEntity): number | nil {
  for (const [index, mEntity] of pairs(mapping)) {
    if (entity === mEntity) return index
  }
}

function blueprintEntity(entity: LuaEntity): Mutable<BlueprintEntity> | nil {
  const { surface, position } = entity

  const stack = getTempBpItemStack()
  for (const radius of [0.01, 1]) {
    const isRollingStock = rollingStockTypes.has(entity.type)
    const indexMapping = stack.create_blueprint({
      surface,
      force: entity.force,
      area: BBox.around(position, radius),
      include_station_names: true,
      include_trains: isRollingStock,
      include_fuel: isRollingStock,
    })
    const matchingIndex = findEntityIndex(indexMapping, entity)
    if (matchingIndex) {
      return stack.get_blueprint_entities()![matchingIndex - 1] as Mutable<BlueprintEntity>
      // assert(bpEntity.entity_number === matchingIndex)
    }
  }
}

function pasteEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction,
  entity: BlueprintEntity,
): LuaEntity | nil {
  const stack = getTempBpItemStack()
  const tilePosition = Pos.floor(position)
  const offsetPosition = Pos.minus(position, tilePosition)
  setBlueprintEntity(stack, entity, offsetPosition, direction)
  stack.blueprint_snap_to_grid = [1, 1]
  stack.blueprint_absolute_snapping = true

  const ghosts = stack.build_blueprint({
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
  entity.direction = getPastedDirection(entity, direction)
  entity.entity_number = 1
  stack.set_blueprint_entities([entity])
  entity.position = nil!
  entity.direction = nil!
  entity.entity_number = nil!
}

function tryCreateUndergroundEntity(
  surface: LuaSurface,
  position: Position,
  direction: defines.direction,
  entity: Entity,
): LuaEntity | nil {
  // assert(isUndergroundBeltType(entity.name))
  const type = (entity as BlueprintEntity).type
  if (type === "output") {
    direction = oppositedirection(direction)
  }
  const params = {
    name: entity.name,
    position,
    direction,
    force: "player",
    type,
  }
  if (!surface.can_place_entity(params)) return nil
  const luaEntity = surface.create_entity(params)
  if (luaEntity && luaEntity.belt_to_ground_type !== type) {
    luaEntity.destroy()
    return nil
  }
  return luaEntity
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
    build_check_type: defines.build_check_type.ghost_revive,
    force: "player",
    create_build_effect_smoke: false,
  }
  if (surface.can_place_entity(params)) {
    return surface.create_entity(params)
  }
}

function createNormalEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction,
  entity: Entity,
): LuaEntity | nil {
  const luaEntity = tryCreateUnconfiguredEntity(surface, position, direction, entity as BlueprintEntity)
  if (!luaEntity) return nil
  if (luaEntity.type === "underground-belt" && luaEntity.belt_to_ground_type !== (entity as BlueprintEntity).type) {
    luaEntity.destroy()
    return nil
  }
  if (entityHasSettings(entity)) {
    const ghost = pasteEntity(surface, position, direction, entity as BlueprintEntity)
    if (ghost) {
      luaEntity.destroy()
      ghost.destroy()
      return nil
    }
  }
  if (entity.items) createItems(luaEntity, entity.items)
  return luaEntity
}

function entityHasSettings(entity: Entity): boolean {
  for (const [key] of pairs(entity)) {
    if (key !== "name" && key !== "items") return true
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
    type: entity.type === "underground-belt" ? entity.belt_to_ground_type : nil,
  })
  if (!newEntity) return entity
  if (entity.valid) {
    game.print("warning: old entity still valid")
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
  if (!items) {
    if (moduleInventory) moduleInventory.clear()
    return
  }
  // has items
  if (!moduleInventory) return

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

function rotateUnderground(luaEntity: LuaEntity, mode: "input" | "output", direction: defines.direction): void {
  if (luaEntity.belt_to_ground_type !== mode) {
    const wasRotatable = luaEntity.rotatable
    luaEntity.rotatable = true
    luaEntity.rotate()
    luaEntity.rotatable = wasRotatable
  }
  const expectedDirection = mode === "output" ? oppositedirection(direction) : direction
  assert(luaEntity.direction === expectedDirection, "cannot rotate underground-belt")
}

const BlueprintEntityHandler: EntityHandler = {
  saveEntity(entity: LuaEntity): LuaMultiReturn<[Entity, SavedDirection] | []> {
    const bpEntity = blueprintEntity(entity)
    if (!bpEntity) return $multi()
    bpEntity.entity_number = nil!
    bpEntity.position = nil!
    bpEntity.direction = nil
    bpEntity.neighbours = nil
    bpEntity.connections = nil
    return $multi(bpEntity, getSavedDirection(entity))
  },

  createEntity(surface: LuaSurface, position: Position, direction: defines.direction, entity: Entity): LuaEntity | nil {
    if (isUndergroundBeltType(entity.name)) return tryCreateUndergroundEntity(surface, position, direction, entity)
    return createNormalEntity(surface, position, direction, entity)
  },

  createPreviewEntity(
    surface: LuaSurface,
    position: Position,
    apparentDirection: defines.direction,
    entityName: string,
  ): LuaEntity | nil {
    const entity = surface.create_entity({
      name: Prototypes.PreviewEntityPrefix + entityName,
      position,
      direction: apparentDirection,
      force: "player",
    })
    makePreviewIndestructible(entity)
    return entity
  },

  updateEntity(luaEntity: LuaEntity, value: BlueprintEntity, direction: defines.direction): LuaEntity {
    if (rollingStockTypes.has(luaEntity.type)) {
      return luaEntity
    }
    if (luaEntity.name !== value.name) {
      luaEntity = upgradeEntity(luaEntity, value.name)
    }

    if (luaEntity.type === "underground-belt") {
      rotateUnderground(luaEntity, value.type ?? "input", direction)
    } else {
      if (luaEntity.type === "loader" || luaEntity.type === "loader-1x1") {
        luaEntity.loader_type = value.type ?? "input"
      }
      luaEntity.direction = direction ?? 0
    }

    const ghost = pasteEntity(luaEntity.surface, luaEntity.position, luaEntity.direction, value)
    if (ghost) ghost.destroy() // should not happen?
    matchItems(luaEntity, value)

    return luaEntity
  },
}
export const EntityHandler: EntityHandler = BlueprintEntityHandler

Migrations.to("0.6.0", () => {
  const railPreviews: string[] = []
  for (const [name] of game.get_filtered_entity_prototypes([
    {
      filter: "type",
      type: "rail-remnants",
    },
  ])) {
    if (name.startsWith(Prototypes.PreviewEntityPrefix)) {
      railPreviews.push(name)
    }
  }

  for (const [, surface] of game.surfaces) {
    for (const entity of surface.find_entities_filtered({ name: railPreviews })) {
      entity.corpse_expires = false
      entity.corpse_immune_to_entity_placement = true
    }
  }
})

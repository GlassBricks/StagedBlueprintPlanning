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
import { StagePosition } from "../assembly/AssemblyContent"
import { Mutable } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { getTempBpItemStack, reviveGhost } from "./blueprinting"
import { Entity } from "./Entity"
import { rollingStockTypes } from "./entity-info"
import { getPastedDirection, getSavedDirection } from "./special-entities"

/** @noSelf */
export interface EntityCreator {
  createEntity(stage: StagePosition, position: Position, direction: defines.direction, entity: Entity): LuaEntity | nil
  updateEntity(luaEntity: LuaEntity, value: Entity, direction: defines.direction): LuaEntity
}

/** @noSelf */
export interface EntitySaver {
  saveEntity(entity: LuaEntity): LuaMultiReturn<[Mutable<Entity>, defines.direction] | []>
}

export interface EntityHandler extends EntityCreator, EntitySaver {}

function findEntityIndex(mapping: Record<number, LuaEntity>, entity: LuaEntity): number | nil {
  for (const [index, mEntity] of pairs(mapping)) {
    if (entity === mEntity) return index
  }
}

function blueprintEntity(entity: LuaEntity): Mutable<BlueprintEntity> | nil {
  const { surface, position } = entity

  const stack = getTempBpItemStack()
  for (const radius of [0.01, 0.5]) {
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
  stack.set_blueprint_entities([
    {
      ...entity,
      position: offsetPosition,
      direction: getPastedDirection(entity, direction),
      entity_number: 1,
    },
  ])
  stack.blueprint_snap_to_grid = [1, 1]
  stack.blueprint_absolute_snapping = true

  const ghosts = stack.build_blueprint({
    surface,
    force: "player",
    position: tilePosition,
  })
  return ghosts[0]
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
  // todo: report cannot insert items
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
  saveEntity(entity: LuaEntity): LuaMultiReturn<[Entity, defines.direction] | []> {
    const bpEntity = blueprintEntity(entity)
    if (!bpEntity) return $multi()
    bpEntity.entity_number = nil!
    bpEntity.position = nil!
    bpEntity.direction = nil
    bpEntity.neighbours = nil
    bpEntity.connections = nil
    return $multi(bpEntity, getSavedDirection(entity))
  },

  createEntity(
    stage: StagePosition,
    position: Position,
    direction: defines.direction,
    entity: Entity,
  ): LuaEntity | nil {
    const surface = stage.surface

    const ghost = pasteEntity(surface, position, direction, entity as BlueprintEntity)
    if (!ghost) return nil
    if (ghost.ghost_type === "underground-belt" && ghost.belt_to_ground_type !== (entity as BlueprintEntity).type) {
      ghost.destroy()
      return nil
    }
    return reviveGhost(ghost)
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
export const DefaultEntityHandler: EntityHandler = BlueprintEntityHandler

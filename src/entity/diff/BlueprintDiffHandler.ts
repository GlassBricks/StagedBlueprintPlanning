/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { Events, Mutable } from "../../lib"
import { BBox, Pos, Position } from "../../lib/geometry"
import { DiffHandler } from "./DiffHandler"

declare const global: {
  tempBPInventory: LuaInventory
}

Events.on_init(() => {
  global.tempBPInventory = game.create_inventory(1)
})

function getTempItemStack(): BlueprintItemStack {
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

  const stack = getTempItemStack()
  for (const radius of [0.01, 0.5]) {
    const indexMapping = stack.create_blueprint({
      surface,
      force: entity.force,
      area: BBox.around(position, radius),
    })
    const matchingIndex = findEntityIndex(indexMapping, entity)
    if (matchingIndex) {
      return stack.get_blueprint_entities()![matchingIndex - 1] as Mutable<BlueprintEntity>
      // assert(bpEntity.entity_number === matchingIndex)
    }
  }
}

function reviveGhost(ghost: GhostEntity): LuaEntity | nil {
  if (!ghost.valid) return
  const [, entity, requestProxy] = ghost.silent_revive({
    return_item_request_proxy: true,
  })
  if (entity === nil) return

  if (!requestProxy) return entity

  // manually add items from request proxy
  const requests = requestProxy.item_requests
  const moduleInventory = entity.get_module_inventory()
  if (moduleInventory) {
    for (const [item, amount] of pairs(requests)) {
      moduleInventory.insert({ name: item, count: amount })
    }
  } else {
    for (const [item, amount] of pairs(requests)) {
      entity.insert({ name: item, count: amount })
    }
  }
  requestProxy.destroy()
  return entity
}

function pasteEntity(
  surface: LuaSurface,
  position: MapPosition,
  direction: defines.direction | undefined,
  entity: BlueprintEntity,
): LuaEntity | nil {
  const stack = getTempItemStack()
  const tilePosition = Pos.floor(position)
  const offsetPosition = Pos.minus(position, tilePosition)
  stack.set_blueprint_entities([
    {
      ...entity,
      position: offsetPosition,
      direction,
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

export const BlueprintDiffHandler: DiffHandler<BlueprintEntity> = {
  save(entity: LuaEntity): BlueprintEntity | nil {
    const bpEntity = blueprintEntity(entity)
    if (!bpEntity) return nil
    bpEntity.entity_number = nil!
    bpEntity.position = nil!
    bpEntity.direction = nil
    bpEntity.neighbours = nil
    bpEntity.connections = nil
    return bpEntity
  },

  create(
    surface: LuaSurface,
    position: Position,
    direction: defines.direction | nil,
    entity: BlueprintEntity,
  ): LuaEntity | nil {
    const ghost = pasteEntity(surface, position, direction, entity)
    return ghost && reviveGhost(ghost)
  },

  match(luaEntity: LuaEntity, value: BlueprintEntity): LuaEntity {
    assert(luaEntity.force.name === "player")
    if (luaEntity.name !== value.name) {
      luaEntity = upgradeEntity(luaEntity, value.name)
    }

    const ghost = pasteEntity(luaEntity.surface, luaEntity.position, luaEntity.direction, value)
    if (ghost) ghost.destroy() // should not happen?
    matchItems(luaEntity, value)

    return luaEntity
  },
}

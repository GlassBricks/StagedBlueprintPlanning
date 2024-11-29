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

import { GhostEntity, LuaEntity, LuaItemStack } from "factorio:runtime"

export function reviveGhost(ghost: GhostEntity): LuaEntity | nil {
  if (!ghost.valid) return
  const [, entity, requestProxy] = ghost.silent_revive()
  if (entity == nil) {
    ghost.destroy()
    return nil
  }

  if (!requestProxy) return entity

  // manually add items from request proxy
  const requests = requestProxy.item_requests
  const moduleInventory = entity.get_module_inventory()
  const toInsert = moduleInventory ?? entity
  for (const item of requests) {
    toInsert.insert({
      count: item.count,
      name: item.name,
      quality: item.quality,
    })
  }
  requestProxy.destroy()
  return entity
}

export function temporaryItemStack(): LuaItemStack {
  const inventory = game.create_inventory(1)
  after_test(() => inventory.destroy())
  return inventory[0]
}

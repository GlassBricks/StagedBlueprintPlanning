// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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

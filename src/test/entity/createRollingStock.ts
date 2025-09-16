// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaSurface } from "factorio:runtime"
import { Pos } from "../../lib/geometry"

export function createRollingStock(
  surface: LuaSurface = game.surfaces[1],
  type: string = "locomotive",
  raiseBuilt: boolean = false,
): LuaEntity {
  return doCreateRollingStocks(surface, raiseBuilt, type)[0]
}
export function createRollingStocks(surface: LuaSurface, ...types: string[]): LuaEntity[] {
  return doCreateRollingStocks(surface, false, ...types)
}
export function doCreateRollingStocks(surface: LuaSurface, raiseBuilt: boolean, ...types: string[]): LuaEntity[] {
  for (let i = 1; i <= types.length * 7 + 5; i += 2) {
    surface.create_entity({
      name: "straight-rail",
      position: Pos(i, 1),
      direction: 4,
      force: "player",
      raise_built: raiseBuilt,
    })
  }
  const entities = types.map((type, i) => {
    const pos = Pos(7 * i + 2, 0.5)
    const entity = surface.create_entity({
      name: type,
      position: pos,
      orientation: 0.25,
      force: "player",
      raise_built: raiseBuilt,
    })
    if (!raiseBuilt) {
      return assert(entity)
    }
    return assert(surface.find_entity(type, pos))
  })
  return entities
}

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

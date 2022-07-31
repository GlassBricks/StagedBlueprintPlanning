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

import { RegisterClass } from "./references"
import { PRecord, PRRecord } from "./util-types"

export interface Map2D<T> {
  readonly [x: number]: PRRecord<number, ReadonlyLuaSet<T>>
  get(x: number, y: number): ReadonlyLuaSet<T> | nil
  getSize(): number
  asIterable(): LuaPairsIterable<number, PRRecord<number, ReadonlyLuaSet<T>>>
}

export interface MutableMap2D<T> extends Map2D<T>, LuaPairsIterable<number, PRecord<number, LuaSet<T>>> {
  [x: number]: PRecord<number, LuaSet<T>>
  add(x: number, y: number, value: T): void
  remove(x: number, y: number, value: T): void
}

// noinspection JSUnusedLocalSymbols
interface Map2DImpl<T> extends LuaPairsIterable<number, PRecord<number, LuaSet<T>>> {
  _: never
}
@RegisterClass("Map2D")
class Map2DImpl<T> implements MutableMap2D<T> {
  [x: number]: PRecord<number, LuaSet<T>>
  get(x: number, y: number): ReadonlyLuaSet<T> | nil {
    const byX = this[x]
    return byX && byX[y]
  }
  add(x: number, y: number, value: T): void {
    const byX = this[x] ?? (this[x] = {})
    const byY = byX[y] ?? (byX[y] = new LuaSet<T>())
    byY.add(value)
  }
  remove(x: number, y: number, value: T): void {
    const byX = this[x]
    if (byX === nil) return
    const byY = byX[y]
    if (byY === nil) return
    byY.delete(value)
    if (next(byY)[0] === nil) {
      delete byX[y]
      if (next(byX)[0] === nil) {
        delete this[x]
      }
    }
  }
  getSize(): number {
    let size = 0
    for (const [, byX] of this) {
      for (const [, byY] of pairs(byX)) {
        size += table_size(byY)
      }
    }
    return size
  }
  public asIterable(): LuaPairsIterable<number, PRRecord<number, ReadonlyLuaSet<T>>> {
    return this as any
  }
}

export function newMap2D<T>(): MutableMap2D<T> {
  return new Map2DImpl<T>()
}

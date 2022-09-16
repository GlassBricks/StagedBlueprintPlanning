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

import { remove_from_list } from "util"
import { RegisterClass } from "./references"
import { PRecord, PRRecord } from "./util-types"

/**
 * Map of 2d indexes to values.
 * Values may be single values or arrays. If is an array, it will have a length of 1 or more.
 */
export interface Map2D<T extends AnyNotNil> {
  readonly [x: number]: PRRecord<number, T | readonly T[]>
  get(x: number, y: number): T | readonly T[] | nil
}

export interface MutableMap2D<T extends AnyNotNil>
  extends Map2D<T>,
    LuaPairsIterable<number, PRecord<number, T | T[]>> {
  [x: number]: PRecord<number, T | readonly T[]>
  add(x: number, y: number, value: T): void
  delete(x: number, y: number, value: T): void
}

// noinspection JSUnusedLocalSymbols
interface Map2DImpl<T extends AnyNotNil> extends LuaPairsIterable<number, PRecord<number, T | T[]>> {
  _: never
}

function isArray<T>(value: T | T[]): value is T[] {
  return (value as any)[1]
}

@RegisterClass("Map2D")
class Map2DImpl<T extends AnyNotNil> implements MutableMap2D<T> {
  [x: number]: PRecord<number, T | T[]>
  get(x: number, y: number): T | readonly T[] | nil {
    const byX = this[x]
    return byX && byX[y]
  }
  add(x: number, y: number, value: T): void {
    const byX = this[x] ?? (this[x] = {})
    const existing = byX[y]
    if (existing === nil) {
      byX[y] = value
    } else if (isArray(existing)) {
      existing.push(value)
    } else {
      byX[y] = [existing, value]
    }
  }
  delete(x: number, y: number, value: T): void {
    const byX = this[x]
    if (byX === nil) return
    const byY = byX[y]
    if (byY === nil) return
    if (isArray(byY)) {
      if (remove_from_list(byY, value) && byY.length === 1) {
        byX[y] = byY[0]
      }
    } else {
      delete byX[y]
      if (next(byX)[0] === nil) {
        delete this[x]
      }
    }
  }
  public asIterable(): LuaPairsIterable<number, PRRecord<number, ReadonlyLuaSet<T>>> {
    return this as any
  }
}

export function newMap2D<T extends AnyNotNil>(): MutableMap2D<T> {
  return new Map2DImpl<T>()
}

export function migrateMap2d060<T extends AnyNotNil>(map: MutableMap2D<T>): void {
  interface OldMap2D {
    [x: number]: PRecord<number, LuaSet<T>>
  }
  const oldMap = map as OldMap2D
  for (const [x, byX] of pairs(oldMap)) {
    for (const [y, values] of pairs(byX)) {
      const valuesArray = Object.keys(values)
      if (valuesArray.length === 0) {
        delete byX[y]
      } else if (valuesArray.length === 1) {
        ;(byX as any)[y] = valuesArray[0]
      } else {
        ;(byX as any)[y] = valuesArray
      }
    }
    if (next(byX)[0] === nil) {
      delete oldMap[x]
    }
  }
}

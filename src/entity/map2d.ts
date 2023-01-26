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

import { remove_from_list } from "util"
import { PRecord, PRRecord, RegisterClass } from "../lib"

// WARNING: assumes values of T have a metatable

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

const arrayMeta: LuaMetatable<any[]> = {}
const getmetatable = _G.getmetatable
const setmetatable = _G.setmetatable

script.register_metatable("Map2D:array", arrayMeta)

function isArray<T>(value: T | T[]): value is T[] {
  return getmetatable(value) == arrayMeta
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
    if (existing == nil) {
      byX[y] = value
    } else if (isArray(existing)) {
      existing.push(value)
    } else {
      byX[y] = setmetatable([existing, value], arrayMeta)
    }
  }
  delete(x: number, y: number, value: T): void {
    const byX = this[x]
    if (byX == nil) return
    const byY = byX[y]
    if (byY == nil) return
    if (isArray(byY)) {
      if (remove_from_list(byY, value) && byY.length == 1) {
        byX[y] = byY[0]
      }
    } else {
      delete byX[y]
      if (next(byX)[0] == nil) {
        delete this[x]
      }
    }
  }
}

export function newMap2D<T extends AnyNotNil>(): MutableMap2D<T> {
  return new Map2DImpl<T>()
}

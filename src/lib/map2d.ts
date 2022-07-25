/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { PRecord, PRRecord } from "./util-types"

export type Map2D<T> = PRRecord<number, PRRecord<number, ReadonlyLuaSet<T>>>
export type MutableMap2D<T> = PRecord<number, PRecord<number, LuaSet<T>>>

export function map2dGet<T>(map: MutableMap2D<T>, x: number, y: number): ReadonlyLuaSet<T> | nil
export function map2dGet<T>(map: Map2D<T>, x: number, y: number): ReadonlyLuaSet<T> | nil
export function map2dGet<T>(map: Map2D<T>, x: number, y: number): ReadonlyLuaSet<T> | nil {
  const byX = map[x]
  return byX && byX[y]
}

export function map2dAdd<T>(map: MutableMap2D<T>, x: number, y: number, value: T): void {
  const byX = (map[x] ??= {})
  const byY = (byX[y] ??= new LuaSet())
  byY.add(value)
}

export function map2dRemove<T>(map: MutableMap2D<T>, x: number, y: number, value: T): void {
  const byX = map[x]
  if (byX === nil) return
  const byY = byX[y]
  if (byY === nil) return
  byY.delete(value)
  if (next(byY)[0] === nil) {
    delete byX[y]
    if (next(byX)[0] === nil) {
      delete map[x]
    }
  }
}

export function map2dSize<T>(map: MutableMap2D<T>): number
export function map2dSize<T>(map: Map2D<T>): number
export function map2dSize<T>(map: Map2D<T>): number {
  let size = 0
  for (const [, byX] of pairs(map)) {
    for (const [, byY] of pairs(byX)) {
      size += table_size(byY)
    }
  }
  return size
}

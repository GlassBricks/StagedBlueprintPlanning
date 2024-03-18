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

import { PRecord, PRRecord, RegisterClass } from "../lib"
import { ProjectEntity } from "./ProjectEntity"

export interface LinkedMap2D<
  T extends {
    _next?: T
  },
> {
  [x: number]: PRecord<number, T | nil> | nil
  get(x: number, y: number): T | nil
  add(x: number, y: number, value: T): void
  delete(x: number, y: number, value: T): void
}

export interface Map2D<T> {
  [x: number]: PRecord<number, T | nil> | nil
  get(x: number, y: number): T | nil
  set(x: number, y: number, value: T): void
  delete(x: number, y: number): void
}

export interface ReadonlyMap2D<T> {
  [x: number]: PRRecord<number, T | nil> | nil
  get(x: number, y: number): T | nil
}

@RegisterClass("Map2D")
class LinkedMap2DImpl<
  T extends {
    _next?: T
  },
> implements LinkedMap2D<T>
{
  [x: number]: PRecord<number, T | nil>
  get(x: number, y: number): T | nil {
    const byX = this[x]
    return byX && byX[y]
  }

  add(x: number, y: number, value: T): void {
    const byX = this[x] ?? (this[x] = {})
    const existing = byX[y]
    if (existing == nil) {
      byX[y] = value
    } else {
      value._next = existing
      byX[y] = value
    }
  }

  delete(x: number, y: number, value: T): void {
    const byX = this[x]
    if (byX == nil) return
    const first = byX[y]
    if (first == nil) return

    let _next = first._next
    if (first == value) {
      if (_next != nil) {
        byX[y] = _next
        first._next = nil
        return
      }
      // delete entry
      delete byX[y]
      if (next(byX)[0] == nil) {
        delete this[x]
      }
      return
    }

    // search for value
    let prev = first
    while (_next != nil) {
      if (_next == value) {
        prev._next = _next._next
        value._next = nil
        return
      }
      prev = _next
      _next = _next._next
    }
  }
}

export function newLinkedMap2d<
  T extends {
    _next: T | nil
  },
>(): LinkedMap2D<T> {
  return new LinkedMap2DImpl<T>()
}

@RegisterClass("uMap2D")
class Map2DImpl<T> implements Map2D<T> {
  [x: number]: PRecord<number, T | nil>
  get(x: number, y: number): T | nil {
    const byX = this[x]
    return byX && byX[y]
  }

  set(x: number, y: number, value: T): void {
    ;(this[x] ??= {})[y] = value
  }

  delete(x: number, y: number): void {
    const byX = this[x]
    if (byX == nil) return
    delete byX[y]
    if (next(byX)[0] == nil) {
      delete this[x]
    }
  }
}

export function newMap2d<T>(): Map2D<T> {
  return new Map2DImpl<T>()
}

function isArray<T>(value: T | T[]): value is T[] {
  return (value as ProjectEntity).firstStage == nil
}

export function _migrateMap2DToLinkedList(map: LinkedMap2D<any>): void {
  for (const [, byX] of pairs(map as Record<number, PRecord<number, any>>)) {
    for (const [y, value] of pairs(byX)) {
      if (isArray(value)) {
        const first = value[0]
        let prev = first
        for (let i = 1; i < value.length; i++) {
          const next = value[i]
          prev._next = next
          prev = next
        }
        byX[y] = first
      } else {
        value._next = nil
        byX[y] = value
      }
    }
  }
}

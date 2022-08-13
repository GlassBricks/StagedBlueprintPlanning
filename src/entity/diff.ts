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

import { deepCompare, Events, Mutable, nilIfEmpty, shallowCopy } from "../lib"
import { Entity } from "./Entity"

declare const NilPlaceholder: unique symbol
export type NilPlaceholder = typeof NilPlaceholder
export type WithNilPlaceholder<T> = T extends nil ? NilPlaceholder : T
export type LayerDiff<E extends Entity = Entity> = {
  readonly [P in keyof E]?: WithNilPlaceholder<E[P]>
}
declare const global: {
  nilPlaceholder: NilPlaceholder
}
let nilPlaceholder: NilPlaceholder
Events.on_init(() => {
  nilPlaceholder = global.nilPlaceholder = {} as any
})
Events.on_load(() => {
  nilPlaceholder = global.nilPlaceholder
})
export function getNilPlaceholder(): NilPlaceholder {
  return assert(nilPlaceholder)
}

const ignoredProps = newLuaSet<keyof any>("position", "direction")
export function getEntityDiff<E extends Entity = Entity>(below: E, above: E): LayerDiff<E> | nil {
  const changes: any = {}
  for (const [key, value] of pairs(above)) {
    if (!ignoredProps.has(key) && !deepCompare(value, below[key])) {
      changes[key] = value
    }
  }
  for (const [key] of pairs(below)) {
    if (!ignoredProps.has(key) && above[key] === nil) changes[key] = nilPlaceholder
  }
  return nilIfEmpty(changes)
}
export function applyDiffToDiff<E extends Entity = Entity>(existing: Mutable<LayerDiff<E>>, diff: LayerDiff<E>): void {
  for (const [key, value] of pairs(diff)) {
    existing[key] = value as any
  }
}
export function applyDiffToEntity<E extends Entity = Entity>(entity: Mutable<E>, diff: LayerDiff<E>): void {
  for (const [key, value] of pairs(diff)) {
    if (value === nilPlaceholder) {
      delete entity[key]
    } else {
      entity[key] = value as any
    }
  }
}

export function toDiffValue<T>(value: T): T | NilPlaceholder {
  return value === nil ? nilPlaceholder : value
}

export function mergeDiff<E extends Entity = Entity>(
  previousValue: E,
  oldDiff: LayerDiff<E> | nil,
  newDiff: LayerDiff<E> | nil,
): LayerDiff<E> | nil {
  if (oldDiff === nil) return newDiff && shallowCopy(newDiff)
  const result: any = {}
  if (newDiff === nil) {
    for (const [key] of pairs(oldDiff)) {
      const value = previousValue[key]
      result[key] = value !== nil ? value : nilPlaceholder
    }
  } else {
    for (const [key, value] of pairs(newDiff)) {
      if (!deepCompare(value, oldDiff[key])) result[key] = value
    }
    for (const [key] of pairs(oldDiff)) {
      if (newDiff[key] === nil) {
        const value = previousValue[key]
        result[key] = value !== nil ? value : nilPlaceholder
      }
    }
  }
  return nilIfEmpty(result)
}

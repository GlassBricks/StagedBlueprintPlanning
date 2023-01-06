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

import { deepCompare, Events, Mutable, nilIfEmpty, shallowCopy } from "../lib"
import { Entity } from "./Entity"
import { DiffValue, getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"

export type StageDiff<E extends Entity> = {
  readonly [P in keyof E]?: DiffValue<E[P]>
}
export type StageDiffInternal<E extends Entity> = {
  readonly [P in keyof E]?: E[P] | NilPlaceholder
}

const ignoredProps = newLuaSet<keyof any>("position", "direction")
let nilPlaceholder: NilPlaceholder | undefined
Events.onInitOrLoad(() => {
  nilPlaceholder = getNilPlaceholder()
})
export function getEntityDiff<E extends Entity>(below: E, above: E): Mutable<StageDiff<E>> | nil {
  const changes: any = {}
  for (const [key, value] of pairs(above)) {
    if (!ignoredProps.has(key) && !deepCompare(value, below[key])) {
      changes[key] = value
    }
  }
  for (const [key] of pairs(below)) {
    if (!ignoredProps.has(key) && above[key] == nil) changes[key] = nilPlaceholder
  }
  return nilIfEmpty(changes)
}

export function _applyDiffToDiffUnchecked<E extends Entity = Entity>(
  existing: Mutable<StageDiff<E>>,
  diff: StageDiff<E>,
): void {
  for (const [key, value] of pairs(diff)) {
    existing[key] = value as any
  }
}
export function applyDiffToEntity<E extends Entity = Entity>(entity: Mutable<E>, diff: StageDiff<E>): void {
  for (const [key, value] of pairs(diff as StageDiffInternal<E>)) {
    if (value == nilPlaceholder) {
      delete entity[key]
    } else {
      entity[key] = value as any
    }
  }
}

export function getDiffDiff<T extends Entity>(
  previousValue: T,
  oldDiff: StageDiff<T> | nil,
  newDiff: StageDiff<T> | nil,
): StageDiff<T> | nil {
  if (oldDiff == nil) return newDiff && shallowCopy(newDiff)
  const result: any = {}
  if (newDiff == nil) {
    for (const [key] of pairs(oldDiff)) {
      const value = previousValue[key]
      result[key] = value != nil ? value : nilPlaceholder
    }
  } else {
    for (const [key, value] of pairs(newDiff)) {
      if (!deepCompare(value, oldDiff[key])) result[key] = value
    }
    for (const [key] of pairs(oldDiff)) {
      if (newDiff[key] == nil) {
        const value = previousValue[key]
        result[key] = value != nil ? value : nilPlaceholder
      }
    }
  }
  return nilIfEmpty(result)
}

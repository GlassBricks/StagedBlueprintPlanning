// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { deepCompare, Events, Mutable, shallowCopy } from "../lib"
import { DiffValue, getNilPlaceholder, NilPlaceholder } from "../utils/diff-value"
import { Entity } from "./Entity"

export type StageDiff<E extends Entity> = {
  readonly [P in keyof E]?: DiffValue<E[P]>
}
export type StageDiffInternal<E extends Entity> = {
  readonly [P in keyof E]?: E[P] | NilPlaceholder
}

const ignoredProps = newLuaSet<keyof any>("position", "direction")
let nilPlaceholder: NilPlaceholder | nil
Events.onInitOrLoad(() => {
  nilPlaceholder = getNilPlaceholder()
})
export function getEntityDiff<E extends Entity>(below: E, above: E): Mutable<StageDiff<E>> | nil {
  let changes: any = nil
  for (const [key, value] of pairs(above)) {
    if (!ignoredProps.has(key) && !deepCompare(value, below[key])) {
      changes ??= {}
      changes[key] = value
    }
  }
  for (const [key] of pairs(below)) {
    if (!ignoredProps.has(key) && above[key] == nil) {
      changes ??= {}
      changes[key] = nilPlaceholder
    }
  }
  return changes
}

export function applyDiffToEntity<E extends Entity = Entity>(entity: Mutable<E>, diff: StageDiff<E>): E {
  for (const [key, value] of pairs(diff as StageDiffInternal<E>)) {
    if (value == nilPlaceholder) {
      delete entity[key]
    } else {
      entity[key] = value as any
    }
  }
  return entity
}

export function getDiffDiff<T extends Entity>(
  previousValue: T,
  oldDiff: StageDiff<T> | nil,
  newDiff: StageDiff<T> | nil,
): StageDiff<T> | nil {
  if (oldDiff == nil) return newDiff && shallowCopy(newDiff)
  let result: any = nil
  if (newDiff == nil) {
    for (const [key] of pairs(oldDiff)) {
      result ??= {}
      const value = previousValue[key]
      result[key] = value != nil ? value : nilPlaceholder
    }
  } else {
    for (const [key, value] of pairs(newDiff)) {
      if (!deepCompare(value, oldDiff[key])) {
        result ??= {}
        result[key] = value
      }
    }
    for (const [key] of pairs(oldDiff)) {
      if (newDiff[key] == nil) {
        result ??= {}
        const value = previousValue[key]
        result[key] = value != nil ? value : nilPlaceholder
      }
    }
  }
  return result
}

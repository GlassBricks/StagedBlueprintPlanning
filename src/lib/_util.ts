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

import * as util from "util"
import { Mutable, PRecord } from "./util-types"

const type = _G.type

export function shallowCopy<T>(obj: T): T {
  if (type(obj) != "table") return obj
  const result: Partial<T> = {}
  for (const [k, v] of pairs(obj)) {
    result[k] = v
  }
  return result as T
}
export const mutableShallowCopy: <T extends object>(obj: T) => Mutable<T> = shallowCopy

export const deepCopy = util.table.deepcopy

export function deepCompare<T>(a: T, b: T): boolean {
  if (a == b) return true
  if (typeof a != "object" || typeof b != "object") return false
  // ignore null
  for (const [k, v] of pairs(a!)) {
    if (!deepCompare(v, b![k])) return false
  }
  for (const [k] of pairs(b!)) {
    if (a![k] == nil) return false
  }
  return true
}

export function shallowCompare<T>(a: T, b: T): boolean {
  if (a == b) return true
  if (typeof a != "object" || typeof b != "object") return false
  for (const [k, v] of pairs(a!)) {
    if (b![k] != v) return false
  }
  for (const [k] of pairs(b!)) {
    if (a![k] == nil) return false
  }
  return true
}

export function isEmpty(obj: object): boolean {
  return next(obj)[0] == nil
}

export function first<T extends AnyNotNil>(iterable: LuaPairsKeyIterable<T>): T | nil {
  return next(iterable)[0]
}

export function assertNever(value: never): never {
  error("should not be reachable: " + serpent.block(value))
}
export const assert: (value: unknown, message?: string) => asserts value = _G.assert

export function shiftNumberKeysUp(obj: PRecord<any, any>, number: number): void {
  const keysToChange: number[] = []
  for (const [changeStage] of pairs(obj)) {
    if (typeof changeStage != "number") break
    if (changeStage >= number) keysToChange.push(changeStage)
  }
  for (let i = keysToChange.length - 1; i >= 0; i--) {
    const key = keysToChange[i]
    obj[key + 1] = obj[key]
    delete obj[key]
  }
}

export function shiftNumberKeysDown(obj: PRecord<any, any>, number: number): void {
  const keysToChange: number[] = []
  for (const [changeStage] of pairs(obj)) {
    if (typeof changeStage != "number") break
    if (changeStage > number) keysToChange.push(changeStage)
  }
  delete obj[number]
  for (const stage of keysToChange) {
    obj[stage - 1] = obj[stage]
    delete obj[stage]
  }
}

export function visitAll(obj: object, fn: (obj: unknown) => void): void {
  const seen = new LuaSet<object>()
  seen.add(obj)
  const queue = [obj]
  while (queue.length > 0) {
    const obj = queue.pop()
    fn(obj)
    for (const [k, v] of pairs(obj)) {
      if (type(k) == "table" && !seen.has(k)) {
        seen.add(k)
        queue.push(k)
      }
      if (type(v) == "table" && !seen.has(v)) {
        seen.add(v)
        queue.push(v)
      }
    }
  }
}
export function getKeySet<T extends AnyNotNil>(keys: LuaPairsIterable<T, unknown>): LuaSet<T> {
  const result = new LuaSet<T>()
  for (const [key] of keys) result.add(key)
  return result
}

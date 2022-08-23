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

import { LayerNumber } from "../entity/AssemblyEntity"
import { Mutable, PRecord } from "./util-types"

export function shallowCopy<T extends object>(obj: T): T {
  const result: Partial<T> = {}
  for (const [k, v] of pairs(obj)) {
    result[k] = v
  }
  return result as T
}
export const mutableShallowCopy: <T extends object>(obj: T) => Mutable<T> = shallowCopy

// does NOT copy metatables
export function deepCopy<T extends object>(obj: T): T {
  const seen = new LuaMap()
  function copy(value: any): any {
    if (type(value) !== "table") return value
    if (type(value.__self) === "userdata") return value
    if (seen.has(value)) return seen.get(value)
    const result: any = {}
    seen.set(value, result)
    for (const [k, v] of pairs(value as Record<any, any>)) {
      result[copy(k)] = copy(v)
    }
    return result
  }
  return copy(obj)
}

export function deepCompare<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object") return false
  // ignore null
  for (const [k, v] of pairs(a)) {
    if (!deepCompare(v, b[k])) return false
  }
  for (const [k] of pairs(b)) {
    if (a[k] === nil) return false
  }
  return true
}

export function shallowCompare<T>(a: T, b: T): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object") return false
  for (const [k, v] of pairs(a)) {
    if (b[k] !== v) return false
  }
  for (const [k] of pairs(b)) {
    if (a[k] === nil) return false
  }
  return true
}

export function isEmpty(obj: object): boolean {
  return next(obj)[0] === nil
}
export function nilIfEmpty<T extends object>(obj: T): T | nil {
  return next(obj)[0] && obj
}

export function assertNever(value: never): never {
  error("should not be reachable: " + serpent.block(value))
}

export function shiftNumberKeysUp(obj: PRecord<LayerNumber, any>, number: number): void {
  const keysToChange: number[] = []
  for (const [changeLayer] of pairs(obj)) {
    if (changeLayer >= number) keysToChange.push(changeLayer)
  }
  for (let i = keysToChange.length - 1; i >= 0; i--) {
    const key = keysToChange[i]
    obj[key + 1] = obj[key]
    delete obj[key]
  }
}

export function shiftNumberKeysDown(obj: PRecord<LayerNumber, any>, number: number): void {
  const keysToChange: number[] = []
  for (const [changeLayer] of pairs(obj)) {
    if (changeLayer > number) keysToChange.push(changeLayer)
  }
  delete obj[number]
  for (const layer of keysToChange) {
    obj[layer - 1] = obj[layer]
    delete obj[layer]
  }
}

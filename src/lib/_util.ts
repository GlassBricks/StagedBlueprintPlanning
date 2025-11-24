// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as util from "util"

const { next, type, pairs } = _G

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

export function nullableConcat<T>(a: T[] | nil, b: T[] | nil): T[] | nil {
  if (!a) return b
  if (!b) return a
  return a.concat(b)
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

export function crossProduct<A, B>(a: A[], b: B[]): [A, B][] {
  const result: [A, B][] = []
  for (const a1 of a) {
    for (const b1 of b) {
      result.push([a1, b1])
    }
  }
  return result
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

export function asMutable<T extends object>(obj: T): Mutable<T> {
  return obj
}

export function asLuaArray<T>(array: T[]): PRecord<number, T> {
  return array
}

export interface WithName {
  name: string
}
export function getName(id: string | WithName): string
export function getName(id: string | WithName | nil): string | nil
export function getName(id: string | WithName | nil): string | nil {
  if (id == nil) return
  if (typeof id == "string") return id
  return id.name
}
export interface WithQuality {
  quality?: string
}
export function getQuality(id: string | WithQuality): string | nil {
  if (id == nil) return
  if (typeof id == "string") return nil
  return id.quality
}

export type PRecord<K extends keyof any, V> = {
  [P in K]?: V
}
export type PRRecord<K extends keyof any, V> = {
  readonly [P in K]?: V
}
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P]
}
export type WithMetatable<T, M> = T & {
  [P in keyof M]: M[P] extends (self: T, ...args: infer A) => infer R ? (this: T, ...args: A) => R : M[P]
}

// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { nil } from "factorio:runtime"
import { PRecord, PRRecord, RegisterClass } from "../lib"

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

  asRecord(): Record<number, Record<number, T | nil>>
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

  asRecord(): Record<number, Record<number, nil | T>> {
    return this
  }
}

export function newMap2d<T>(): Map2D<T> {
  return new Map2DImpl<T>()
}

// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

export interface GlobalEvent<A extends any[]> {
  addListener(listener: (...args: A) => void): void
  removeListener(listener: (...args: A) => void): void
  raise(...args: A): void
}

class GlobalEventImpl<A extends any[]> implements GlobalEvent<A> {
  declare add: LuaTableAddKeyMethod<any>
  declare delete: LuaTableDeleteMethod<any>
  addListener(listener: (...args: A) => void) {
    this.add(listener)
  }
  removeListener(listener: (...args: A) => void) {
    this.delete(listener)
  }
  raise(...args: A) {
    for (const listener of this as unknown as LuaSet<(...args: A) => void>) listener(...args)
  }
}

export function globalEvent<A extends any[]>(): GlobalEvent<A> {
  return new GlobalEventImpl<A>()
}

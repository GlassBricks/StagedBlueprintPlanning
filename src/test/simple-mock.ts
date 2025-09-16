// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaObject } from "factorio:runtime"

/** @noSelf */
interface LuaObjectLike {
  readonly valid: boolean
  destroy(): void
}

// noinspection JSUnusedGlobalSymbols
const metatable = {
  __index(this: LuaObjectLike, key: string): any {
    error(`${key} not valid or supported`)
  },
  __newindex(this: LuaObjectLike, key: string): void {
    error(`${key} not valid or supported`)
  },
}

export function simpleMock<T extends LuaObjectLike | LuaObject>(value?: Partial<T>): T {
  const base = {
    valid: true,
    destroy() {
      base.valid = false
    },
    object_name: "mock",
  }
  Object.assign(base, value)
  return setmetatable(base, metatable) as T
}

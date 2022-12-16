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

import { mock } from "tstl-expect"

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

export function makeMocked<T>(keys: (keyof T)[]): mock.MockedObjectNoSelf<T> {
  const result = {} as any
  for (const key of keys) {
    result[key] = mock.fnNoSelf()
  }
  return result
}

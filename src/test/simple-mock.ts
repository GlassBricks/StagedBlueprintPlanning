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

/** @noSelf */
interface LuaObjectLike {
  readonly valid: boolean
  destroy(): void
}

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
  }
  Object.assign(base, value)
  return setmetatable(base, metatable) as T
}

export interface MockCreateEntity {
  readonly name: string
  readonly position: MapPosition
  readonly direction?: defines.direction
}

export function entityMock<T extends LuaEntity>(params: MockCreateEntity & Partial<T>): T {
  return simpleMock<T>({
    direction: 0,
    ...params,
    object_name: "LuaEntity",
    destructible: true,
    minable: true,
    rotatable: true,
    operable: true,
  })
}

export function isMock(obj: LuaObjectLike): boolean {
  return getmetatable(obj) === metatable
}

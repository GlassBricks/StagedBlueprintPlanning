/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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

export interface MockCreateEntity {
  readonly name: string
  readonly position?: MapPosition
  readonly direction?: defines.direction
}

function noop() {
  //
}

export function entityMock<T extends LuaEntity>(params: MockCreateEntity & Partial<T>): T {
  return simpleMock<T>({
    type: params.name,
    direction: 0,
    position: { x: 0, y: 0 },
    ...params,
    object_name: "LuaEntity",
    destructible: true,
    minable: true,
    rotatable: true,
    operable: true,
    circuit_connection_definitions: [],
    disconnect_neighbour: noop,
    force: "player",
    unit_number: 0,
  })
}
export interface BuiltinEntityKeys {
  valid: true
  object_name: true

  type: true
  direction: true
  destructible: true
  minable: true
  rotatable: true
  operable: true
  circuit_connection_definitions: true
  disconnect_neighbour: true
  unit_number: true
  force: true
}

export function isMock(obj: LuaObjectLike): boolean {
  return getmetatable(obj) === metatable
}
export function makeMocked<T>(keys: (keyof T)[]): mock.Mocked<T> {
  const result = {} as mock.Mocked<T>
  for (const key of keys) {
    result[key] = spy<any>()
  }
  return result
}
export function makeStubbed<T>(keys: (keyof T)[]): mock.Stubbed<T> {
  const result = {} as mock.Stubbed<T>
  for (const key of keys) {
    result[key] = stub<any>()
  }
  return result
}

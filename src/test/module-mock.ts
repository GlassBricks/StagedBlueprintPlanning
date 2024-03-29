/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { mock, MockNoSelf } from "tstl-expect"
import { AnySelflessFun } from "tstl-expect/dist/types"
import fnNoSelf = mock.fnNoSelf

// note: no imports from other parts of mod, because this file overrides "require"

type SelflessFun = (this: void, ...args: any) => any
export interface MockedFunctionTable {
  original: SelflessFun
  mock?: MockNoSelf<any>
}
const mockableFunctionMt: LuaMetatable<MockedFunctionTable> = {
  __call(...args: unknown[]) {
    if (this.mock) {
      return this.mock(...args)
    }
    return this.original(...args)
  },
}

const IsModuleMockedSymbol = Symbol("IsModuleMocked")

function mockableFunction(original: SelflessFun) {
  return setmetatable({ original }, mockableFunctionMt)
}
function isMockableFunction(v: unknown): v is MockedFunctionTable {
  return typeof v == "object" && getmetatable(v) == mockableFunctionMt
}

function mockModule(module: Record<keyof any, any>) {
  if (module[IsModuleMockedSymbol]) return
  for (const [k, v] of pairs(module)) {
    if (typeof v == "function") {
      module[k] = mockableFunction(v as SelflessFun)
    }
  }
  module[IsModuleMockedSymbol] = true
}

function maybeMockModule(module: { _mockable?: boolean }) {
  if (typeof module == "object" && getmetatable(module) == nil && module._mockable) {
    mockModule(module)
  }
}

if ("factorio-test" in script.active_mods) {
  const originalRequire = _G.require
  _G.require = function (modname: string) {
    const module = originalRequire(modname)
    maybeMockModule(module)
    return module
  }
}

function checkIsMockable(module: object): void {
  if (!(IsModuleMockedSymbol in module)) error("Passed module is not mockable")
}
function mockModuleToResult<T extends object>(module: T, stub: boolean, result: any): void {
  for (const [k, v] of pairs(module)) {
    if (isMockableFunction(v)) {
      const mock = fnNoSelf(stub ? nil : v.original)
      if (type(k) == "string") mock.mockName(k as string)
      v.mock = mock
      result[k] = mock
    }
  }
}
export type MockedModule<T extends object> = {
  [K in keyof T]: T[K] extends AnySelflessFun ? MockNoSelf<T[K]> : never
}

export function doModuleMock<T extends object>(module: T, stub: boolean): MockedModule<T> {
  checkIsMockable(module)
  const result: any = {}
  mockModuleToResult(module, stub, result)
  return result
}

export function moduleMock<T extends object>(module: T, stub: boolean): MockedModule<T> {
  const result: Record<keyof any, any> = {}
  checkIsMockable(module)
  before_each(() => {
    mockModuleToResult(module, stub, result)
  })
  after_each(() => {
    resetModuleMock(module)
  })
  return result as any
}

export function clearModuleMock(module: object): void {
  if (!(IsModuleMockedSymbol in module)) {
    error("Module is not set up for mocking")
  }
  for (const [, v] of pairs(module)) {
    if (isMockableFunction(v)) {
      v.mock?.clear()
    }
  }
}

export function resetModuleMock(module: object): void {
  if (!(IsModuleMockedSymbol in module)) error("Module is not set up for mocking")
  for (const [, v] of pairs(module)) {
    if (isMockableFunction(v)) {
      v.mock = nil
    }
  }
}

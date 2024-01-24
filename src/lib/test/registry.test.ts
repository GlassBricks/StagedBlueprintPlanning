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

import { LuaGameScript } from "factorio:runtime"
import expect from "tstl-expect"
import { Registry } from "../registry"

let registry: Registry<string>
before_each(() => {
  registry = new Registry("string", (x) => x)
})
describe("registering", () => {
  let oldGame: LuaGameScript

  before_each(() => {
    oldGame = game
    ;(_G as any).game = nil!
  })
  after_each(() => {
    ;(_G as any).game = oldGame
  })

  test("Can register function", () => {
    const testFuncName = "foo"
    registry.registerAs(testFuncName, "foo")
    expect(registry.get(testFuncName)).toEqual("foo")
    expect(registry.nameOf("foo")).toEqual(testFuncName)
  })

  test("error on duplicate name", () => {
    expect(() => {
      registry.registerAs("foo", "bar")
      registry.registerAs("foo", "baz")
    }).toError()
  })

  test("error on nonexistent func", () => {
    expect(() => {
      registry.get("foo22")
    }).toError()
    expect(() => {
      registry.nameOf("foo22")
    }).toError()
  })
})
test("Error when registering after load", () => {
  expect(() => {
    const registry = new Registry<string>("string", (x) => x)
    registry.registerAs("foo", "bar")
  }).toError()
})

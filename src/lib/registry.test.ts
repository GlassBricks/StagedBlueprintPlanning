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

import { Registry } from "./registry"

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
    registry.registerRaw(testFuncName, "foo")
    assert.same("foo", registry.get(testFuncName))
    assert.same(testFuncName, registry.nameOf("foo"))
  })

  test("error on duplicate name", () => {
    assert.error(() => {
      registry.registerRaw("foo", "bar")
      registry.registerRaw("foo", "baz")
    })
  })

  test("error on nonexistent func", () => {
    assert.error(() => {
      registry.get("foo22")
    })
    assert.error(() => {
      registry.nameOf("foo22")
    })
  })
})
test("Error when registering after load", () => {
  assert.error(() => {
    const registry = new Registry<string>("string", (x) => x)
    registry.registerRaw("foo", "bar")
  })
})

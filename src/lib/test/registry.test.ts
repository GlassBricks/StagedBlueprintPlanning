// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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

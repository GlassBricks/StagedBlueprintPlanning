// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { LazyLoadClass } from "../LazyLoad"

interface Foo {
  f1(): void
  f2(): void
}

function createFoo(value: { name: string }): Foo {
  const { name } = value
  return {
    f1() {
      print(`f1 ${name}`)
    },
    f2() {
      print(`f2 ${name}`)
    },
  }
}

const fooClass = LazyLoadClass("lazyFoo", createFoo)

test("can call functions", () => {
  const foo = fooClass({ name: "foo" })
  foo.f1()
  foo.f2()
})

test("does not load until first call", () => {
  const foo = fooClass({ name: "foo" }) as any
  expect(rawget(foo, "f1")).toBeNil()
})

test("still errors on non-function", () => {
  const foo = fooClass({ name: "foo" }) as any
  expect(() => foo.e1()).toThrow()
})
declare const storage: {
  _testFoo: Foo
}

test("works after reload", () => {
  storage._testFoo = fooClass({ name: "foo" })
  storage._testFoo.f1()
}).after_reload_mods(() => {
  expect(rawget(storage._testFoo, "f1")).toBeNil()
  storage._testFoo.f2()

  storage._testFoo = nil!
})

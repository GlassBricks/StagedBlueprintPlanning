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

import expect from "tstl-expect"
import { LazyLoadClass } from "../experiment"

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
declare const global: {
  _testFoo: Foo
}

test("works after reload", () => {
  global._testFoo = fooClass({ name: "foo" })
  global._testFoo.f1()
}).after_mod_reload(() => {
  expect(rawget(global._testFoo, "f1")).toBeNil()
  global._testFoo.f2()

  global._testFoo = nil!
})

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
import { mockObj } from "../mock-obj"

interface Foo {
  f1(arg: any): void
  f2(): unknown
}

test("can create and use mock object", () => {
  const foo = mockObj<Foo>()
  foo.f1(3)
  expect(foo.f1).toHaveBeenCalledWith(3)
  expect(foo.f2).not.toHaveBeenCalled()
  foo.f2()
  expect(foo.f2).toHaveBeenCalled()
  foo.f2.returns(5)
  expect(foo.f2()).toBe(5)
})

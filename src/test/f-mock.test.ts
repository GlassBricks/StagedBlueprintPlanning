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
import { fMock } from "./f-mock"

test("can use fMock", () => {
  interface Foo {
    f1(value: number): unknown
    f2(): void
  }
  const foo = fMock<Foo>()

  expect(foo.f2).not.toHaveBeenCalled()
  foo.f2()
  expect(foo.f2).toHaveBeenCalled()

  foo.f1.returns(3)
  foo.f1(2)
  expect(foo.f1).toHaveBeenLastCalledWith(2)
  expect(foo.f1).toHaveLastReturnedWith(3)
})

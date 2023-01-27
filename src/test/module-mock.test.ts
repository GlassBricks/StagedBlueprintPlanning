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
import { moduleMock } from "./module-mock"
import mod = require("./module-mock-example")

const module = moduleMock(mod, false)

test("can mock module", () => {
  module.foo.returnsOnce("bar")
  expect(module.foo()).toBe("bar")
  expect(module.foo()).toBe("foo")
})

test("cannot mock module that doesn't have _mockable", () => {
  expect(() => moduleMock({}, false)).toThrow("Passed module is not mockable")
  expect(() => moduleMock(require("./reviveGhost"), false)).toThrow()
})

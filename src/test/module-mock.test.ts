// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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
  expect(() => moduleMock(require("./test-util"), false)).toThrow()
})

// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { fMock } from "./f-mock"

interface Foo {
  f1(value: number): unknown
  f2(): void
}

const foo = fMock<Foo>()
test("can use fMock", () => {
  expect(foo.f2).not.toHaveBeenCalled()
  foo.f2()
  expect(foo.f2).toHaveBeenCalled()

  foo.f1.returns(3)
  foo.f1(2)
  expect(foo.f1).toHaveBeenLastCalledWith(2)
  expect(foo.f1).toHaveLastReturnedWith(3)
})

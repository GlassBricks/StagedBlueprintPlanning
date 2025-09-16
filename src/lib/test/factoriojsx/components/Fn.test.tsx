// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { property } from "../../../event"
import { FactorioJsx } from "../../../factoriojsx"
import { Fn } from "../../../factoriojsx/components"
import { testRender } from "../../gui"

test("fn", () => {
  const val = property("one")
  const wrapper = testRender(<Fn from={val} uses="flow" map={{ invoke: (x) => <label caption={x} /> }} />)
  function findLabels() {
    return wrapper.findAll("label").map((x) => x.element.caption)
  }

  expect(findLabels()).toEqual(["one"])
  val.set("two")
  expect(findLabels()).toEqual(["two"])
})

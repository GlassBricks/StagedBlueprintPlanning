/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { FactorioJsx } from "../../../factoriojsx"
import { Fn } from "../../../factoriojsx/components"
import { property } from "../../../event"
import { testRender } from "../../gui"
import expect from "tstl-expect"

test("fn", () => {
  const val = property("one")
  const wrapper = testRender(<Fn from={val} uses="flow" map={{ invoke: (x) => <label caption={x} /> }} />)
  function findLabels() {
    return wrapper.findAll("label").map((x) => x.element.caption)
  }

  expect(findLabels()).to.equal(["one"])
  val.set("two")
  expect(findLabels()).to.equal(["two"])
})

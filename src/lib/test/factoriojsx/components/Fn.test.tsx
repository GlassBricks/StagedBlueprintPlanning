/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { FactorioJsx } from "../../../factoriojsx"
import { Fn } from "../../../factoriojsx/components/Fn"
import { state } from "../../../observable"
import { testRender } from "../../gui"

test("fn", () => {
  const val = state("one")
  const wrapper = testRender(<Fn from={val} uses="flow" map={{ invoke: (x) => <label caption={x} /> }} />)
  function findLabels() {
    return wrapper.findAll("label").map((x) => x.native.caption)
  }

  assert.same(["one"], findLabels())
  val.set("two")
  assert.same(["two"], findLabels())
})

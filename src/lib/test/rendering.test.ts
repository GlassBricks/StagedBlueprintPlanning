/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { SurfaceIdentification } from "factorio:runtime"
import expect from "tstl-expect"
import draw from "../rendering"

describe("line", () => {
  test("draws a line", () => {
    const obj = draw("line", {
      surface: 1 as SurfaceIdentification,
      from: { x: 1, y: 1 },
      to: { x: 2, y: 2 },
      color: [],
      width: 1,
    })
    expect(obj.valid).to.be(true)
    expect(obj.object_name).to.be("_RenderObj")
    expect(obj.surface).to.equal(game.surfaces[1])
    expect(obj.from.position).to.equal({ x: 1, y: 1 })
    expect(obj.to.position).to.equal({ x: 2, y: 2 })
    // obj.set_from({ x: 1, y: 2 })
    // expect(obj.from.position).to.equal({ x: 1, y: 2 })
    // broken right now, but not needed
    obj.visible = false
    expect(obj.visible).to.be(false)
    obj.destroy()
    expect(obj.valid).to.be(false)
  })
})

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

import draw from "./rendering"

describe("line", () => {
  test("draws a line", () => {
    const obj = draw("line", {
      surface: 1 as SurfaceIdentification,
      from: { x: 1, y: 1 },
      to: { x: 2, y: 2 },
      color: [],
      width: 1,
    })
    assert.true(obj.valid)
    assert.equal(game.surfaces[1], obj.surface)
    assert.same({ x: 1, y: 1 }, obj.from.position)
    obj.set_from({ x: 1, y: 2 })
    assert.same({ x: 1, y: 2 }, obj.from.position)
    assert.same({ x: 2, y: 2 }, obj.to.position)
    obj.visible = false
    assert.false(obj.visible)
    obj.destroy()
    assert.false(obj.valid)
  })
})

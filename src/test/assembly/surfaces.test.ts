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

import { createStageSurface, prepareArea } from "../../assembly/surfaces"
import { BBox } from "../../lib/geometry"
import expect from "tstl-expect"

test("generateStageSurface", () => {
  const surface = createStageSurface()
  after_test(() => game.delete_surface(surface))
  expect(surface.index).not.to.equal(1)
  expect(surface.always_day).to.be(true)
  expect(surface.generate_with_lab_tiles).to.be(true)
})

test('prepareArea() "generates" chunks', () => {
  const surface = createStageSurface()
  after_test(() => game.delete_surface(surface))

  const area = BBox.coords(0, 0, 4, 4)
  prepareArea(surface, area.scale(32))
  for (const [x, y] of area.iterateTiles()) {
    const pos = { x, y }
    expect(surface.is_chunk_generated(pos)).to.be(true)
  }
})

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

import expect from "tstl-expect"
import { BBox } from "../../lib/geometry"
import { createStageSurface } from "../../project/surfaces"

test("generateStageSurface creates surface and generates chunks", () => {
  const surface = createStageSurface()
  after_test(() => game.delete_surface(surface))
  expect(surface.index).not.to.equal(1)
  expect(surface.always_day).to.be(true)
  expect(surface.generate_with_lab_tiles).to.be(true)

  const area = BBox.coords(0, 0, 1, 1)
  for (const [x, y] of area.iterateTiles()) {
    const pos = { x, y }
    expect(surface.is_chunk_generated(pos)).to.be(true)
  }
})

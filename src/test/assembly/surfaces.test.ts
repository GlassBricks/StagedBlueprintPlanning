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

import { getAssemblySurface, getOrGenerateAssemblySurface, prepareArea } from "../../assembly/surfaces"
import { BBox } from "../../lib/geometry"

test("getBlueprintSurface(1) returns nauvis", () => {
  const nauvis = getAssemblySurface(1)!
  assert.equal(1, nauvis.index)
})

test("getOrGenerateAssemblySurface() creates other surfaces", () => {
  const surface = getOrGenerateAssemblySurface(2)
  assert.not_equal(1, surface.index)
  assert.true(surface.always_day)
  assert.true(surface.generate_with_lab_tiles)
})

test('prepareArea() "generates" chunks', () => {
  const surface = getOrGenerateAssemblySurface(2)

  const area = BBox.coords(0, 0, 4, 4)
  prepareArea(surface, area.scale(32))
  for (const [x, y] of area.iterateTiles()) {
    const pos = { x, y }
    assert.true(surface.is_chunk_generated(pos))
  }
})

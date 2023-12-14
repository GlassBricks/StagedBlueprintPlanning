/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaSurface } from "factorio:runtime"
import expect from "tstl-expect"
import { BBox, Pos } from "../../lib/geometry"
import { setTilesAndCheckerboard, setTilesAndWater } from "../../project/set-tiles"

let surface: LuaSurface
before_each(() => {
  surface = game.surfaces[1]
  surface.build_checkerboard(bbox.expand(20))
  surface.find_entities().forEach((entity) => entity.destroy())
})

const bbox = BBox.around({ x: 0, y: 0 }, 10)
after_each(() => {
  surface.build_checkerboard(bbox.expand(20))
  surface.find_entities().forEach((entity) => entity.destroy())
})

test("setTilesAndWater", () => {
  assert(
    surface.create_entity({
      name: "iron-chest",
      position: { x: 0.5, y: 0.5 },
    }),
  )
  const result = setTilesAndWater(surface, bbox, "stone-path")
  expect(result).toBe(true)
  for (const tile of surface.find_tiles_filtered({ area: bbox })) {
    const expectedTile = Pos.isZero(tile.position) ? "stone-path" : "water"
    expect(tile).toMatchTable({
      name: expectedTile,
    })
  }
})

test("setTilesAndWater, nonexistent tile", () => {
  const result = setTilesAndWater(surface, bbox, "this doesn't exist")
  expect(result).toBe(false)
})

test("setTilesAndCheckerboard", () => {
  assert(
    surface.create_entity({
      name: "iron-chest",
      position: { x: 0.5, y: 0.5 },
    }),
  )
  const result = setTilesAndCheckerboard(surface, bbox, "stone-path")
  expect(result).toBe(true)
  for (const tile of surface.find_tiles_filtered({ area: bbox })) {
    rawset(tile, "position", tile.position)
    if (Pos.isZero(tile.position)) {
      expect(tile).toMatchTable({
        name: "stone-path",
      })
    } else {
      expect(tile).toMatchTable({
        name: expect.stringMatching("^lab%-"),
      })
    }
  }
})

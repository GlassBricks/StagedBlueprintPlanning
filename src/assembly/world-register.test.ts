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

import { BBox, Pos } from "../lib/geometry"
import { Assembly, Layer } from "./Assembly"
import { _mockAssembly } from "./UserAssembly"
import { deleteAssembly, getLayerAtPosition, registerAssembly } from "./world-register"

let mockAssembly: Assembly
before_all(() => {
  const surface = game.surfaces[1]
  mockAssembly = _mockAssembly(Pos(1, 1))
  for (let i = 0; i < 5; i++) {
    mockAssembly.pushLayer({
      surface,
      position: Pos(i * 32, 0),
    })
  }
})

test("registers in world correctly", () => {
  registerAssembly(mockAssembly)
  after_test(() => deleteAssembly(mockAssembly))
  function assertLayersCorrect(): void {
    for (const layer of mockAssembly.layers as Layer[]) {
      const center = BBox.center(layer)
      assert.equal(layer, getLayerAtPosition(layer.surface, center))
      assert.not_equal(layer, getLayerAtPosition(layer.surface, center.plus(Pos(33, 33))))
    }
  }
  assertLayersCorrect()
  mockAssembly.pushLayer({
    surface: game.surfaces[1],
    position: Pos(5 * 32, 0),
  })
  assertLayersCorrect()
  mockAssembly.delete()
  for (const layer of mockAssembly.layers as Layer[]) {
    const center = BBox.center(layer)
    assert.nil(getLayerAtPosition(layer.surface, center))
  }
})

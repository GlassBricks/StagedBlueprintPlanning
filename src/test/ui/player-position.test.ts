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

import { generateAssemblySurfaces, getAssemblySurface } from "../../assembly/surfaces"
import { createDemonstrationAssembly } from "../../assembly/UserAssembly"
import { BBox } from "../../lib/geometry"
import { playerCurrentLayer } from "../../ui/player-position"

test("playerCurrentLayer", () => {
  const assembly = createDemonstrationAssembly(3)
  after_test(() => assembly.delete())
  const player = game.players[1]!
  player.teleport([-1, -1], game.surfaces[1])
  const currentLayer = playerCurrentLayer(1 as PlayerIndex)
  assert.nil(currentLayer.get())

  for (const [, layer] of assembly.iterateLayers()) {
    player.teleport(BBox.center(layer), layer.surface)
    assert.equal(currentLayer.get(), layer)
  }

  generateAssemblySurfaces(2)

  for (const [, layer] of assembly.iterateLayers()) {
    player.teleport(BBox.center(layer), getAssemblySurface(2))
    assert.equal(currentLayer.get(), layer)
  }

  const layer1 = assembly.getLayer(1)
  player.teleport(BBox.center(layer1), layer1.surface)
  assert.equal(currentLayer.get(), layer1)

  assembly.delete()

  assert.nil(currentLayer.get())
})

/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { createDemonstrationAssembly } from "../../assembly/Assembly"
import { generateAssemblySurfaces, getAssemblySurface } from "../../assembly/surfaces"
import { BBox } from "../../lib/geometry"
import { playerCurrentStage } from "../../ui/player-position"

test("playerCurrentStage", () => {
  const assembly = createDemonstrationAssembly(3)
  after_test(() => assembly.delete())
  const player = game.players[1]!
  player.teleport([-1, -1], game.surfaces[1])
  const currentStage = playerCurrentStage(1 as PlayerIndex)
  assert.nil(currentStage.get())

  for (const [, stage] of assembly.iterateStages()) {
    player.teleport(BBox.center(stage), stage.surface)
    assert.equal(currentStage.get(), stage)
  }

  generateAssemblySurfaces(2)

  for (const [, stage] of assembly.iterateStages()) {
    player.teleport(BBox.center(stage), getAssemblySurface(2))
    assert.equal(currentStage.get(), stage)
  }

  const stage1 = assembly.getStage(1)!
  player.teleport(BBox.center(stage1), stage1.surface)
  assert.equal(currentStage.get(), stage1)

  assembly.delete()

  assert.nil(currentStage.get())
})

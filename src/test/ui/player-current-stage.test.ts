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

import { _deleteAllAssemblies, createAssembly } from "../../assembly/Assembly"
import { playerCurrentStage } from "../../ui/player-current-stage"

test("playerCurrentStage", () => {
  const assembly = createAssembly("Test", 3)
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  const currentStage = playerCurrentStage(1 as PlayerIndex)
  assert.nil(currentStage.get())

  for (const [, stage] of assembly.iterateStages()) {
    player.teleport(player.position, stage.surface)
    assert.equal(currentStage.get(), stage)
  }

  assembly.delete()
  assert.nil(currentStage.get())
})

after_all(() => {
  const player = game.players[1]!
  player.teleport([0, 0], 1 as SurfaceIndex)
  _deleteAllAssemblies()
})

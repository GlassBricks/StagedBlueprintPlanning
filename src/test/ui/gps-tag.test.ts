/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { SurfaceIndex } from "factorio:runtime"
import expect from "tstl-expect"
import { Events } from "../../lib"
import { getPlayer } from "../../lib/test/misc"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"

after_each(() => {
  _deleteAllProjects()
})

test.each(["editor", "god", "spectator"])("teleport by clicking on gps tag from %s controller", (controller) => {
  after_test(() => {
    player.set_controller({ type: defines.controllers.editor })
  })
  const testProject = createUserProject("test", 3)
  const player = getPlayer()
  player.teleport([0, 0], 1 as SurfaceIndex)

  player.set_controller({ type: defines.controllers[controller] })

  const s1 = testProject.getStage(1)!.surface

  Events.raiseFakeEventNamed("on_player_clicked_gps_tag", {
    player_index: player.index,
    surface: s1.name,
    position: { x: 2, y: 3 },
  })

  expect(player.position).toEqual({ x: 2, y: 3 })
  expect(player.surface).toEqual(s1)
})

test("teleport by clicking on gps tag if already in project", () => {
  const testProject = createUserProject("test", 3)
  const player = getPlayer()

  const s1 = testProject.getStage(1)!.surface
  const s2 = testProject.getStage(1)!.surface
  player.teleport([0, 0], s1)

  Events.raiseFakeEventNamed("on_player_clicked_gps_tag", {
    player_index: player.index,
    surface: s2.name,
    position: { x: 2, y: 3 },
  })

  expect(player.position).toEqual({ x: 2, y: 3 })
  expect(player.surface).toEqual(s2)
})

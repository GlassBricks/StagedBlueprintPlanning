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
import expect from "tstl-expect"
import { syncMapGenSettings } from "../../project/map-gen"
import { UserProject } from "../../project/ProjectDef"
import { createUserProject } from "../../project/UserProject"
import { setupTestSurfaces } from "./Project-mock"

const surfaces = setupTestSurfaces(2)
let project: UserProject
before_each(() => {
  project = createUserProject("test", 3)
})
after_each(() => {
  project.delete()
  surfaces.forEach((s) => {
    s.generate_with_lab_tiles = true
    s.clear()
  })
})

test("sync map gen settings", () => {
  const surface1 = surfaces[0]
  surface1.map_gen_settings = {
    ...surface1.map_gen_settings,
    seed: 100,
  }
  surface1.generate_with_lab_tiles = false
  const surface2 = surfaces[1]
  surface2.map_gen_settings = {
    ...surface2.map_gen_settings,
    seed: 200,
  }
  surface2.generate_with_lab_tiles = true

  syncMapGenSettings(project.getStage(1)!)

  expect(surface1).toMatchTable({
    map_gen_settings: { seed: 100 },
    generate_with_lab_tiles: false,
  })
  expect(surface2).toMatchTable({
    map_gen_settings: { seed: 100 },
    generate_with_lab_tiles: false,
  })

  after_ticks(20, () => {
    // wait for surface to reset
  })
})

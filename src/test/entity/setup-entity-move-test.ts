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

import { createStageSurface, prepareArea } from "../../assembly/surfaces"
import { BBox, Position } from "../../lib/geometry"

export function setupEntityMoveTest(
  numSurfaces = 3,
  origPos: Position = { x: 1, y: 0.5 },
  origDir = defines.direction.east,
  doReset = true,
): {
  surfaces: LuaSurface[]
  entities: LuaEntity[]
  origPos: Position
  origDir: defines.direction
} {
  const surfaces: LuaSurface[] = []
  before_all(() => {
    for (let i = 0; i < numSurfaces; i++) {
      const surface = createStageSurface()
      prepareArea(surface, BBox.around({ x: 0, y: 0 }, 20))
      surfaces[i] = surface
    }
  })

  if (doReset)
    after_all(() => {
      surfaces.forEach((s) => game.delete_surface(s))
    })

  const entities: LuaEntity[] = []
  before_each(() => {
    surfaces.forEach((s) => s.find_entities().forEach((e) => e.destroy()))
    for (let i = 0; i < surfaces.length; i++) {
      const surface = surfaces[i]
      const entity = surface.create_entity({
        name: "decider-combinator",
        position: origPos,
        direction: origDir,
        force: "player",
      })!
      assert(entity, "failed to create entity")
      entities[i] = entity
    }
  })

  return { surfaces, entities, origPos, origDir }
}

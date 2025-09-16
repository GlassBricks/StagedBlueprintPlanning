// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaEntity, LuaSurface } from "factorio:runtime"
import { Position } from "../../lib/geometry"
import { setupTestSurfaces } from "../project/Project-mock"

export function setupEntityMoveTest(
  numSurfaces = 3,
  origPos: Position = { x: 1, y: 0.5 },
  origDir = defines.direction.east,
): {
  surfaces: LuaSurface[]
  entities: LuaEntity[]
  origPos: Position
  origDir: defines.direction
} {
  const surfaces = setupTestSurfaces(numSurfaces)

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

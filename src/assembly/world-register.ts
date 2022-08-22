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

import { assertNever, Events } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Assembly } from "./Assembly"
import { AssemblyEvents } from "./AssemblyImpl"
import floor = math.floor

type AssembliesByChunk = Record<number, Record<number, Assembly | nil>>
declare const global: {
  inWorldAssemblies: AssembliesByChunk
}

Events.on_init(() => {
  global.inWorldAssemblies = {}
  for (const [, surface] of game.surfaces) {
    global.inWorldAssemblies[surface.index] = {}
  }
})
Events.on_surface_created((e) => {
  global.inWorldAssemblies[e.surface_index] = {}
})
Events.on_pre_surface_deleted((e) => {
  delete global.inWorldAssemblies[e.surface_index]
})

export function registerAssemblyLocation(assembly: Assembly): void {
  const byChunk = global.inWorldAssemblies
  const bbox = assembly.bbox
  const topLeft = Pos.div(bbox.left_top, 32).floor()
  const bottomRight = Pos.div(bbox.right_bottom, 32).ceil()
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = byChunk[x] ?? (byChunk[x] = {})
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      byX[y] = assembly
    }
  }
}

export function unregisterAssemblyLocation(assembly: Assembly): void {
  const byChunk = global.inWorldAssemblies
  const bbox = assembly.bbox
  const topLeft = Pos.div(bbox.left_top, 32).floor()
  const bottomRight = Pos.div(bbox.right_bottom, 32).ceil()
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = byChunk[x]
    if (!byX) continue
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      delete byX[y]
    }
    if (next(byX)[0] === nil) delete byChunk[x]
  }
}

AssemblyEvents.addListener((e) => {
  if (e.type === "assembly-created") {
    registerAssemblyLocation(e.assembly)
  } else if (e.type === "assembly-deleted") {
    unregisterAssemblyLocation(e.assembly)
  } else if (e.type !== "layer-added") {
    // will be same area
    assertNever(e)
  }
})

export function findIntersectingAssembly(area: BBox): Assembly | nil {
  const topLeft = Pos.div(area.left_top, 32).floor()
  const bottomRight = Pos.div(area.right_bottom, 32).ceil()
  const layersByChunk = global.inWorldAssemblies
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = layersByChunk[x]
    if (!byX) continue
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      const assembly = byX[y]
      if (assembly) return assembly
    }
  }
  return nil
}

export function getAssemblyAtPosition(position: Position): Assembly | nil {
  const byChunk = global.inWorldAssemblies
  const byX = byChunk[floor(position.x / 32)]
  if (!byX) return nil
  return byX[floor(position.y / 32)]
}

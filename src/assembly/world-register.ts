/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { Events, funcRef, registerFunctions } from "../lib"
import { Pos, Position } from "../lib/geometry"
import { Assembly, AssemblyChangeEvent, Layer } from "./Assembly"
import floor = math.floor

type LayersByChunk = Record<number, Record<number, Layer | nil>>
declare const global: {
  inWorldLayers: Record<SurfaceIndex, LayersByChunk>
}

Events.on_init(() => {
  global.inWorldLayers = {}
  for (const [, surface] of game.surfaces) {
    global.inWorldLayers[surface.index] = {}
  }
})
Events.on_surface_created((e) => {
  global.inWorldLayers[e.surface_index] = {}
})
Events.on_pre_surface_deleted((e) => {
  delete global.inWorldLayers[e.surface_index]
})

function addLayer(layer: Layer): void {
  const surface = layer.surface
  if (!surface.valid) return
  const layersByChunk = global.inWorldLayers[surface.index]
  const topLeft = Pos.div(layer.left_top, 32).floor()
  const bottomRight = Pos.div(layer.right_bottom, 32).ceil()
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = layersByChunk[x] ?? (layersByChunk[x] = {})
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      byX[y] = layer
    }
  }
}

function removeLayer(layer: Layer): void {
  const surface = layer.surface
  if (!surface.valid) return
  const layersByChunk = global.inWorldLayers[surface.index]
  const topLeft = Pos.div(layer.left_top, 32).floor()
  const bottomRight = Pos.div(layer.right_bottom, 32).ceil()
  for (const x of $range(topLeft.x, bottomRight.x - 1)) {
    const byX = layersByChunk[x]
    if (!byX) continue
    for (const y of $range(topLeft.y, bottomRight.y - 1)) {
      delete byX[y]
    }
    if (next(byX)[0] === nil) delete layersByChunk[x]
  }
}

export function registerAssembly(assembly: Assembly): void {
  // todo: listen to layer updates
  for (const layer of assembly.layers) {
    addLayer(layer)
  }
  assembly.events.subscribeIndependently(funcRef(onAssemblyChanged))
}

function onAssemblyChanged(_: unknown, event: AssemblyChangeEvent) {
  if (event.type === "layer-pushed") {
    addLayer(event.layer)
  } else if (event.type === "assembly-deleted") {
    deleteAssembly(event.assembly)
  }
}
registerFunctions("WorldRegister", { onAssemblyChanged })

export function deleteAssembly(assembly: Assembly): void {
  for (const layer of assembly.layers) {
    removeLayer(layer)
  }
}

export function getLayerAtPosition(surface: LuaSurface, position: Position): Layer | nil {
  const bySurface = global.inWorldLayers[surface.index]
  if (!bySurface) return nil
  const byX = bySurface[floor(position.x / 32)]
  if (!byX) return nil
  return byX[floor(position.y / 32)]
}

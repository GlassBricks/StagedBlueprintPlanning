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

import { LayerNumber } from "../entity/AssemblyEntity"
import { assertNever, bind, Events, registerFunctions } from "../lib"
import { Pos } from "../lib/geometry"
import draw, { AnyRender, TextRender } from "../lib/rendering"
import { Assembly, AssemblyId, GlobalAssemblyEvent, Layer } from "./Assembly"
import { AssemblyEvents } from "./UserAssembly"

declare const global: {
  assemblyHighlights: LuaMap<AssemblyId, LuaMap<LayerNumber, AnyRender[]>>
}
Events.on_init(() => {
  global.assemblyHighlights = new LuaMap()
})

AssemblyEvents.addListener((event: GlobalAssemblyEvent) => {
  if (event.type === "assembly-created") {
    createAssemblyHighlights(event.assembly)
  } else if (event.type === "assembly-deleted") {
    removeHighlights(event.assembly.id)
  } else {
    assertNever(event)
  }
})
function createAssemblyHighlights(assembly: Assembly) {
  const highlights = new LuaMap<LayerNumber, AnyRender[]>()
  global.assemblyHighlights.set(assembly.id, highlights)
  for (const [layerNum, layer] of assembly.iterateLayers()) {
    highlights.set(layerNum, createHighlightsForLayer(layer))
  }
}

function createHighlightsForLayer(layer: Layer): AnyRender[] {
  const { surface, left_top, right_bottom } = layer

  // const boxId = rendering.draw_rectangle({
  const box = draw("rectangle", {
    color: [1, 1, 1, 0.5],
    width: 4,
    filled: false,
    left_top,
    right_bottom,
    surface,
    draw_on_ground: true,
  })

  const name = layer.assembly.getLayerLabel(layer.layerNumber)
  const text = draw("text", {
    text: name.get(),
    surface,
    target: Pos.plus(left_top, Pos(0.5, 0)),
    color: [1, 1, 1],
    font: "default",
    scale: 1.5,
    alignment: "left",
    scale_with_zoom: true,
  })

  name.subscribeIndependently(bind(onLayerNameChange, text))
  return [box, text]
}

function onLayerNameChange(text: TextRender, _: unknown, name: LocalisedString): void {
  if (text.valid) text.text = name
}
registerFunctions("assembly-display", { onLayerNameChange })

function removeHighlights(id: AssemblyId): void {
  const highlights = global.assemblyHighlights.get(id)
  if (!highlights) return
  global.assemblyHighlights.delete(id)
  for (const [, renders] of highlights) {
    for (const render of renders) {
      if (render.valid) render.destroy()
    }
  }
}

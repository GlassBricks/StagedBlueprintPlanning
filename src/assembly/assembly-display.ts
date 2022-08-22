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
import { assertNever, bind, Events, PRecord, registerFunctions, shiftNumberKeys } from "../lib"
import { Pos } from "../lib/geometry"
import { State } from "../lib/observable"
import draw, { AnyRender, DrawParams, TextRender } from "../lib/rendering"
import { Assembly, AssemblyId, GlobalAssemblyEvent, Layer } from "./Assembly"
import { AssemblyEvents } from "./AssemblyImpl"

declare const global: {
  assemblyHighlights: LuaMap<AssemblyId, PRecord<LayerNumber, AnyRender[]>>
}
Events.on_init(() => {
  global.assemblyHighlights = new LuaMap()
})

AssemblyEvents.addListener((event: GlobalAssemblyEvent) => {
  if (event.type === "assembly-created") {
    createAssemblyHighlights(event.assembly)
  } else if (event.type === "assembly-deleted") {
    removeHighlights(event.assembly.id)
  } else if (event.type === "layer-added") {
    shiftNumberKeys(global.assemblyHighlights.get(event.assembly.id)!, event.layer.layerNumber)
    createHighlightsForLayer(event.layer)
  } else {
    assertNever(event)
  }
})
function createAssemblyHighlights(assembly: Assembly) {
  global.assemblyHighlights.set(assembly.id, {})
  for (const [, layer] of assembly.iterateLayers()) {
    createHighlightsForLayer(layer)
  }
}

function createHighlightsForLayer(layer: Layer): void {
  if (!layer.valid) return
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

  function createText(
    name: State<LocalisedString>,
    vertical_alignment: DrawParams["text"]["vertical_alignment"],
  ): TextRender {
    const text: TextRender = draw("text", {
      text: name.get(),
      surface,
      target: Pos.plus(left_top, Pos(0.5, 0)),
      color: [1, 1, 1],
      font: "default",
      scale: 1.5,
      alignment: "left",
      scale_with_zoom: true,
      vertical_alignment,
    })
    name.subscribeIndependently(bind(onLayerNameChange, text))
    return text
  }
  const assemblyText: TextRender = createText(layer.assembly.displayName, "bottom")
  const layerText: TextRender = createText(layer.name, "top")

  global.assemblyHighlights.get(layer.assembly.id)![layer.layerNumber] = [box, assemblyText, layerText]
}

function onLayerNameChange(text: TextRender, _: unknown, name: LocalisedString): void {
  if (text.valid) text.text = name
}
registerFunctions("assembly-display", { onLayerNameChange })

function removeHighlights(id: AssemblyId): void {
  const highlights = global.assemblyHighlights.get(id)
  if (!highlights) return
  global.assemblyHighlights.delete(id)
  for (const [, renders] of pairs(highlights)) {
    for (const render of renders) {
      if (render.valid) render.destroy()
    }
  }
}

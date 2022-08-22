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

import { assertNever, bind, RegisterClass } from "../lib"
import { Pos } from "../lib/geometry"
import { Observer, Subscription } from "../lib/observable"
import draw, { AnyRender, TextRender } from "../lib/rendering"
import { Assembly, AssemblyChangeEvent, Layer } from "./Assembly"

/**
 * Manages in-world outlines and labels.
 */
@RegisterClass("AssemblyDisplay")
class AssemblyDisplay implements Observer<AssemblyChangeEvent> {
  private highlights: AnyRender[][] = []

  public invoke(_: Subscription, event: AssemblyChangeEvent) {
    if (event.type === "layer-pushed") {
      this.createHighlightsForLayer(event.layer)
    } else if (event.type === "assembly-deleted") {
      this.removeAllHighlights()
    } else {
      assertNever(event)
    }
  }
  public init(assembly: Assembly) {
    for (const [, layer] of assembly.iterateLayers()) {
      this.createHighlightsForLayer(layer)
    }
    assembly.events.subscribeIndependently(this)
  }

  private createHighlightsForLayer(layer: Layer): void {
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
    this.highlights.push([box, text])

    name.subscribeIndependently(bind(AssemblyDisplay.onLayerNameChange, text))
  }

  private static onLayerNameChange(this: void, text: TextRender, _: unknown, name: LocalisedString): void {
    text.text = name
  }

  private removeAllHighlights(): void {
    for (const [boxId, textId] of this.highlights) {
      boxId.destroy()
      textId.destroy()
    }
    this.highlights = []
  }
}

export function setupAssemblyDisplay(assembly: Assembly): void {
  const display = new AssemblyDisplay()
  display.init(assembly)
}

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

import { StageNumber } from "../entity/AssemblyEntity"
import { assertNever, bind, Events, PRecord, registerFunctions, shiftNumberKeysDown, shiftNumberKeysUp } from "../lib"
import { Pos } from "../lib/geometry"
import { State } from "../lib/observable"
import draw, { AnyRender, DrawParams, TextRender } from "../lib/rendering"
import { AssemblyEvents } from "./Assembly"
import { Assembly, AssemblyId, GlobalAssemblyEvent, Stage } from "./AssemblyDef"

/**
 * This file handles the in-world outline/text label of stages.
 */

declare const global: {
  assemblyHighlights: LuaMap<AssemblyId, PRecord<StageNumber, AnyRender[]>>
}
Events.on_init(() => {
  global.assemblyHighlights = new LuaMap()
})

AssemblyEvents.addListener((event: GlobalAssemblyEvent) => {
  if (event.type === "assembly-created") {
    createAssemblyHighlights(event.assembly)
  } else if (event.type === "assembly-deleted") {
    removeAllHighlights(event.assembly.id)
  } else if (event.type === "stage-added") {
    shiftNumberKeysUp(global.assemblyHighlights.get(event.assembly.id)!, event.stage.stageNumber)
    createHighlightsForStage(event.stage)
  } else if (event.type === "pre-stage-deleted") {
    removeHighlightsForStage(event.assembly, event.stage)
    shiftNumberKeysDown(global.assemblyHighlights.get(event.assembly.id)!, event.stage.stageNumber)
  } else if (event.type !== "stage-deleted") {
    assertNever(event)
  }
})
function createAssemblyHighlights(assembly: Assembly) {
  global.assemblyHighlights.set(assembly.id, {})
  for (const [, stage] of assembly.iterateStages()) {
    createHighlightsForStage(stage)
  }
}

function createHighlightsForStage(stage: Stage): void {
  if (!stage.valid) return
  const { surface, left_top, right_bottom } = stage

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
    name.subscribeIndependently(bind(onStageNameChange, text))
    return text
  }
  const assemblyText: TextRender = createText(stage.assembly.displayName, "bottom")
  const stageText: TextRender = createText(stage.name, "top")

  global.assemblyHighlights.get(stage.assembly.id)![stage.stageNumber] = [box, assemblyText, stageText]
}

function onStageNameChange(text: TextRender, _: unknown, name: LocalisedString): void {
  if (text.valid) text.text = name
}
registerFunctions("assembly-display", { onStageNameChange })

function removeAllHighlights(id: AssemblyId): void {
  const highlights = global.assemblyHighlights.get(id)
  if (!highlights) return
  global.assemblyHighlights.delete(id)
  for (const [, renders] of pairs(highlights)) {
    for (const render of renders) {
      if (render.valid) render.destroy()
    }
  }
}

function removeHighlightsForStage(assembly: Assembly, stage: Stage): void {
  const highlights = global.assemblyHighlights.get(assembly.id)
  if (!highlights) return
  const renders = highlights[stage.stageNumber]
  if (!renders) return
  for (const render of renders) {
    if (render.valid) render.destroy()
  }
}

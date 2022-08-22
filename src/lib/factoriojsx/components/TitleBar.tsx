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

import { funcRef, registerFunctions } from "../../index"
import { MaybeState } from "../../observable"
import { destroy, FactorioJsx, GuiEvent, Spec, SpecChildren } from "../index"
import { CloseButton } from "./buttons"

export function TitleBar(props: { children?: SpecChildren }): Spec {
  return (
    <flow
      direction="horizontal"
      styleMod={{
        horizontal_spacing: 8,
        height: 28,
      }}
      onCreate={(element) => {
        const parent = element.parent!
        if (parent.type === "frame" && parent.parent === element.gui.screen) element.drag_target = parent
      }}
    >
      {props.children}
    </flow>
  )
}

export function DraggableSpace(): Spec {
  return (
    <empty-widget
      ignored_by_interaction
      style="draggable_space"
      styleMod={{
        horizontally_stretchable: true,
        height: 24,
      }}
    />
  )
}

export function closeParentParent(e: OnGuiClickEvent): void {
  const parent = e.element.parent!.parent!
  if (parent.type === "frame") destroy(parent)
}
export function closeSelf(e: GuiEvent): void {
  destroy(e.element)
}

registerFunctions("gui:TitleBar", { closeParentParent, closeSelf })

// noinspection JSUnusedGlobalSymbols
export function SimpleTitleBar(props: { title: MaybeState<LocalisedString> }): Spec {
  return (
    <TitleBar>
      <label caption={props.title} style="frame_title" ignored_by_interaction />
      <DraggableSpace />
      <CloseButton on_gui_click={funcRef(closeParentParent)} />
    </TitleBar>
  )
}

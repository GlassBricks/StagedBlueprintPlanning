/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { funcRef, registerFunctions } from "../../index"
import { MaybeProperty } from "../../event"
import { ClickEventHandler, destroy, Element, ElementChildren, FactorioJsx, GuiEvent } from "../index"
import { CloseButton } from "./buttons"
import { HorizontalPusher } from "./misc"

export function TitleBar(props: { children?: ElementChildren }): Element {
  return (
    <flow
      direction="horizontal"
      styleMod={{
        horizontal_spacing: 8,
        height: 28,
      }}
      onCreate={(element) => {
        const parent = element.parent!
        if (parent.type == "frame" && parent.parent == element.gui.screen) element.drag_target = parent
      }}
    >
      {props.children}
    </flow>
  )
}

export function DraggableSpace(): Element {
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
  if (parent.type == "frame") destroy(parent)
}
export function closeSelf(e: GuiEvent): void {
  destroy(e.element)
}

registerFunctions("gui:TitleBar", { closeParentParent, closeSelf })

export function SimpleTitleBar(props: {
  title: MaybeProperty<LocalisedString>
  onClose?: ClickEventHandler
  useDraggableSpace?: boolean // default true
}): Element {
  return (
    <TitleBar>
      <label caption={props.title} style="frame_title" ignored_by_interaction />
      {props.useDraggableSpace != false ? <DraggableSpace /> : <HorizontalPusher />}
      <CloseButton on_gui_click={props.onClose ?? funcRef(closeParentParent)} />
    </TitleBar>
  )
}

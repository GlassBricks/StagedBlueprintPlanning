// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaGuiElement, OnGuiClickEvent } from "factorio:runtime"
import { MaybeProperty } from "../../event"
import { bind, registerFunctions } from "../../index"
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
        vertical_align: "center",
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

export function closeSelf(e: GuiEvent): void {
  destroy(e.element)
}
export function closeParentParent(e: OnGuiClickEvent): void {
  closeParentAtLevel(2, e)
}
export function closeParentAtLevel(level: number, e: OnGuiClickEvent): void {
  let current: LuaGuiElement = e.element
  for (let i = 0; i < level; i++) {
    const parent = current.parent
    if (parent == nil) return
    current = parent
  }
  if (current != nil) {
    destroy(current)
  }
}

registerFunctions("gui:TitleBar", { closeSelf, closeParentAtLevel, closeParentParent })

export function SimpleTitleBar(props: {
  title?: MaybeProperty<LocalisedString>
  onClose?: ClickEventHandler
  useDraggableSpace?: boolean // default true
  frameLevel?: number
}): Element {
  const frameLevel = (props.frameLevel ?? 1) + 1
  return (
    <TitleBar>
      {props.title != nil && <label caption={props.title} style="frame_title" ignored_by_interaction />}
      {props.useDraggableSpace != false ? <DraggableSpace /> : <HorizontalPusher />}
      <CloseButton on_gui_click={props.onClose ?? bind(closeParentAtLevel, frameLevel)} />
    </TitleBar>
  )
}

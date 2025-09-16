// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { Sprites } from "../../../constants"
import { Element, ElemProps, FactorioJsx } from "../index"

export function CloseButton(props: Partial<ElemProps<"sprite-button">>): Element {
  return (
    <sprite-button
      style="frame_action_button"
      sprite="utility/close"
      hovered_sprite="utility/close_black"
      clicked_sprite="utility/close_black"
      tooltip={["gui.close"]}
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}

export function ExpandButton(props: Partial<ElemProps<"sprite-button">>): Element {
  return (
    <sprite-button
      style="frame_action_button"
      sprite="utility/expand"
      hovered_sprite="utility/expand"
      clicked_sprite="utility/expand"
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}
export function CollapseButton(props: Partial<ElemProps<"sprite-button">>): Element {
  return (
    <sprite-button
      style="frame_action_button"
      sprite={Sprites.CollapseLeft}
      hovered_sprite={Sprites.CollapseLeftDark}
      clicked_sprite={Sprites.CollapseLeftDark}
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}

export function RenameButton(props: Partial<ElemProps<"sprite-button">>): Element {
  return (
    <sprite-button
      style="mini_button_aligned_to_text_vertically_when_centered"
      sprite="utility/rename_icon"
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}

export function TrashButton(props: Partial<ElemProps<"sprite-button">>): Element {
  return <sprite-button style="tool_button_red" sprite="utility/trash" mouse_button_filter={["left"]} {...props} />
}

export function RefreshButton(props: Partial<ElemProps<"sprite-button">>): Element {
  return (
    <sprite-button
      style="tool_button"
      sprite="utility/refresh"
      mouse_button_filter={["left"]}
      tooltip={["gui.refresh"]}
      {...props}
    />
  )
}

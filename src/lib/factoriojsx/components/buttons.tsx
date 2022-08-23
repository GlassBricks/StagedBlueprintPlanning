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

import { ElemProps, FactorioJsx, Spec } from "../index"

export function CloseButton(props: Partial<ElemProps<"sprite-button">>): Spec {
  return (
    <sprite-button
      style="frame_action_button"
      sprite="utility/close_white"
      hovered_sprite="utility/close_black"
      clicked_sprite="utility/close_black"
      tooltip={["gui.close"]}
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}

export function RenameButton(props: Partial<ElemProps<"sprite-button">>): Spec {
  return (
    <sprite-button
      style="mini_button_aligned_to_text_vertically_when_centered"
      sprite="utility/rename_icon_small_black"
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}

export function TrashButton(props: Partial<ElemProps<"sprite-button">>): Spec {
  return <sprite-button style="tool_button_red" sprite={"utility/trash"} mouse_button_filter={["left"]} {...props} />
}

export function DotDotDotButton(props: Partial<ElemProps<"sprite-button">>): Spec {
  return (
    <sprite-button
      style="frame_action_button"
      sprite="utility/expand_dots_white"
      hovered_sprite="utility/expand_dots"
      clicked_sprite="utility/expand_dots"
      mouse_button_filter={["left"]}
      {...props}
    />
  )
}

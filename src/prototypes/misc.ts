/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { PrototypeData } from "factorio:common"
import { ButtonStyleSpecification, SoundPrototype } from "factorio:prototype"
import { Prototypes, Styles } from "../constants"

declare const data: PrototypeData

const banana: SoundPrototype = {
  type: "sound",
  name: Prototypes.BANANA,
  filename: "__bp100__/sounds/banana.ogg",
}

data.extend([banana])

// styles

// local styles = data.raw["gui-style"].default
//
// -- Nomenclature: small = size 36; tiny = size 32
//
// -- Imitates a listbox, but allowing for way more customisation by using real buttons
// styles["fp_scroll-pane_fake_listbox"] = {
//   type = "scroll_pane_style",
//   parent = "scroll_pane_with_dark_background_under_subheader",
//   extra_right_padding_when_activated = -12,
//   background_graphical_set = { -- rubber grid
//   position = {282,17},
//   corner_size = 8,
//   overall_tiling_vertical_size = 22,
//   overall_tiling_vertical_spacing = 6,
//   overall_tiling_vertical_padding = 4,
//   overall_tiling_horizontal_padding = 4
// },
//   vertically_stretchable = "on",
//   padding = 0,
//   vertical_flow_style = {
//     type = "vertical_flow_style",
//     vertical_spacing = 0
//   }
// }

const styles = data.raw["gui-style"].default!

styles[Styles.FakeListBox] = {
  type: "scroll_pane_style",
  parent: "scroll_pane_under_subheader",
  extra_right_padding_when_activated: -12,
  background_graphical_set: {
    position: [282, 17],
    corner_size: 8,
    overall_tiling_vertical_size: 22,
    overall_tiling_vertical_spacing: 6,
    overall_tiling_vertical_padding: 4,
    overall_tiling_horizontal_padding: 4,
  },
  vertically_stretchable: "on",
  padding: 0,
  vertical_flow_style: {
    type: "vertical_flow_style",
    vertical_spacing: 0,
  },
}

styles[Styles.FakeListBoxItem] = {
  type: "button_style",
  parent: "list_box_item",
  left_padding: 4,
  right_padding: 8,
  horizontally_stretchable: "on",
  horizontally_squashable: "on",
}
assume<ButtonStyleSpecification>(styles.button)

styles[Styles.FakeListBoxItemActive] = {
  type: "button_style",
  parent: Styles.FakeListBoxItem,
  default_graphical_set: styles.button.selected_graphical_set,
  hovered_graphical_set: styles.button.selected_hovered_graphical_set,
  clicked_graphical_set: styles.button.selected_clicked_graphical_set,
  default_font_color: styles.button.selected_font_color,
}

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

// noinspection JSUnusedGlobalSymbols

export interface BaseEvents {
  on_gui_click: true
  on_gui_opened: true
  on_gui_closed: true
  on_gui_location_changed: "location"
}

export interface CheckboxEvents {
  on_gui_checked_state_changed: "state"
}

export interface TextFieldEvents {
  on_gui_confirmed: true
  on_gui_text_changed: "text"
}

export interface RadioButtonEvents {
  on_gui_checked_state_changed: "state"
}

export interface DropDownEvents {
  on_gui_selection_state_changed: "selected_index"
}

export interface ListBoxEvents {
  on_gui_selection_state_changed: "selected_index"
}

export interface ChooseElemButtonEvents {
  on_gui_elem_changed: "elem_value"
}

export interface TextBoxEvents {
  on_gui_text_changed: "text"
}

export interface SliderEvents {
  on_gui_value_changed: "slider_value"
}

export interface TabbedPaneEvents {
  on_gui_selected_tab_changed: "selected_tab_index"
}

export interface SwitchEvents {
  on_gui_switch_state_changed: "switch_state"
}

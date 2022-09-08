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

import { funcOn, MutableState, RegisterClass, State, state } from "../lib"
import { Component, FactorioJsx, Spec } from "../lib/factoriojsx"
import { Fn, RenameButton } from "../lib/factoriojsx/components"

export interface ItemRenameProps {
  name: MutableState<string>
  displayName: State<LocalisedString>
  renameTooltip: LocalisedString
  maximalWidth?: number
}

@RegisterClass("gui:ItemRename")
export class ItemRename extends Component<ItemRenameProps> {
  isRenaming = state(false)
  item!: ItemRenameProps

  override render(props: ItemRenameProps): Spec {
    this.item = props
    return (
      <flow
        direction="horizontal"
        styleMod={{
          vertical_align: "center",
          horizontal_spacing: 5,
        }}
      >
        <Fn uses="flow" from={this.isRenaming} map={funcOn(this.nameDisplay)} />
        <RenameButton tooltip={props.renameTooltip} on_gui_click={this.isRenaming.toggleFn()} />
      </flow>
    )
  }

  nameDisplay(isRenaming: boolean): Spec {
    return isRenaming ? (
      <textfield
        text={this.item.name}
        clear_and_focus_on_right_click
        lose_focus_on_confirm
        on_gui_confirmed={this.isRenaming.setValueFn(false)}
        styleMod={{ maximal_width: this.item.maximalWidth ?? 200 }}
      />
    ) : (
      <label
        style="subheader_caption_label"
        caption={this.item.displayName}
        styleMod={{ maximal_width: this.item.maximalWidth ?? 200 }}
      />
    )
  }
}

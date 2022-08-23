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

import { funcOn, RegisterClass } from "../../lib"
import { Component, FactorioJsx, Spec } from "../../lib/factoriojsx"
import { RenameButton } from "../../lib/factoriojsx/components/buttons"
import { Fn } from "../../lib/factoriojsx/components/Fn"
import { MutableState, State, state } from "../../lib/observable"

export interface ItemRenameProps {
  readonly name: MutableState<string>
  readonly displayName: State<LocalisedString>
  readonly renameTooltip: LocalisedString
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
      />
    ) : (
      <label
        style="subheader_caption_label"
        caption={this.item.displayName}
        styleMod={{
          maximal_width: 200,
        }}
      />
    )
  }
}

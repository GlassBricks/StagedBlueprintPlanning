/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { ibind, MutableProperty, Property, property, Props, RegisterClass } from "../lib"
import { Component, Element, FactorioJsx } from "../lib/factoriojsx"
import { Fn, RenameButton } from "../lib/factoriojsx/components"

export interface ItemRenameProps {
  name: MutableProperty<string>
  displayName: Property<LocalisedString>
  renameTooltip: LocalisedString
  maximalWidth?: number
}

@RegisterClass("gui:ItemRename")
export class ItemRename extends Component<ItemRenameProps> {
  isRenaming = property(false)
  item!: ItemRenameProps

  override render(props: ItemRenameProps): Element {
    this.item = props
    return (
      <flow
        direction="horizontal"
        styleMod={{
          vertical_align: "center",
          horizontal_spacing: 5,
        }}
      >
        <Fn uses="flow" from={this.isRenaming} map={ibind(this.nameDisplay)} />
        <RenameButton tooltip={props.renameTooltip} on_gui_click={Props.toggleFn(this.isRenaming)} />
      </flow>
    )
  }

  nameDisplay(isRenaming: boolean): Element {
    return isRenaming ? (
      <textfield
        text={this.item.name}
        clear_and_focus_on_right_click
        lose_focus_on_confirm
        on_gui_confirmed={Props.setValueFn(this.isRenaming, false)}
        styleMod={{ maximal_width: this.item.maximalWidth ?? 200 }}
        onCreate={(e) => e.focus()}
      />
    ) : (
      <label
        style="subheader_caption_label"
        caption={this.item.displayName}
        styleMod={{ maximal_width: this.item.maximalWidth ?? 200 }}
        ignored_by_interaction
      />
    )
  }
}

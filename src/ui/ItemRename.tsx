// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString } from "factorio:runtime"
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
        lose_focus_on_confirm
        on_gui_confirmed={Props.setValueFn(this.isRenaming, false)}
        styleMod={{ maximal_width: this.item.maximalWidth ?? 200 }}
        onCreate={(e) => e.focus()}
        icon_selector
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

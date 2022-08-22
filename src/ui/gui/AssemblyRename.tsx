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

import { Assembly } from "../../assembly/Assembly"
import { funcOn, RegisterClass } from "../../lib"
import { Component, FactorioJsx, Spec, Tracker } from "../../lib/factoriojsx"
import { RenameButton } from "../../lib/factoriojsx/components/buttons"
import { Fn } from "../../lib/factoriojsx/components/Fn"
import { HorizontalSpacer } from "../../lib/factoriojsx/components/misc"
import { state } from "../../lib/observable"
import { L_Gui } from "../../locale"
import { LayerSelector } from "./LayerSelector"

@RegisterClass("gui:AssemblyRename")
export class AssemblyRename extends Component<{ assembly: Assembly }> {
  isRenaming = state(false)
  assembly!: Assembly

  override render(props: { assembly: Assembly }): Spec {
    this.assembly = props.assembly
    return (
      <flow
        direction="horizontal"
        styleMod={{
          vertical_align: "center",
        }}
      >
        <Fn uses="flow" from={this.isRenaming} map={funcOn(this.nameDisplay)} />
        <HorizontalSpacer width={5} />
        <RenameButton tooltip={[L_Gui.RenameAssembly]} onClick={this.isRenaming.toggleFn()} />
      </flow>
    )
  }

  nameDisplay(isRenaming: boolean): Spec {
    return isRenaming ? (
      <textfield text={this.assembly.name} lose_focus_on_confirm on_gui_confirmed={this.isRenaming.setValueFn(false)} />
    ) : (
      <label style="subheader_caption_label" caption={this.assembly.displayName} />
    )
  }
}

@RegisterClass("gui:LayerRename")
export class LayerRename extends Component<{ assembly: Assembly }> {
  isRenaming = state(false)
  private selectedLayer = state(0)
  private assembly!: Assembly

  override render(props: { assembly: Assembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly

    return (
      <flow
        direction="horizontal"
        styleMod={{
          vertical_align: "center",
        }}
      >
        <Fn uses="flow" from={this.isRenaming} map={funcOn(this.nameDisplay)} />
        <HorizontalSpacer width={5} />
        <RenameButton tooltip={[L_Gui.RenameLayer]} onClick={this.isRenaming.toggleFn()} />
      </flow>
    )
  }
  nameDisplay(isRenaming: boolean): Spec {
    if (isRenaming) {
      let layer = this.assembly.getLayer(this.selectedLayer.get())
      if (!layer) layer = this.assembly.getLayer(1)!
      return (
        <textfield
          text={layer.name}
          lose_focus_on_confirm
          clear_and_focus_on_right_click
          on_gui_confirmed={this.isRenaming.setValueFn(false)}
        />
      )
    }

    return <LayerSelector assembly={this.assembly} selectedIndex={this.selectedLayer} />
  }
}

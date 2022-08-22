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
import { onAssemblyDeleted } from "../../assembly/UserAssembly"
import { funcOn, RegisterClass } from "../../lib"
import { Component, destroy, FactorioJsx, renderNamed, Spec, Tracker } from "../../lib/factoriojsx"
import { TrashButton } from "../../lib/factoriojsx/components/buttons"
import { showDialog } from "../../lib/factoriojsx/components/Dialog"
import { HorizontalPusher } from "../../lib/factoriojsx/components/misc"
import { SimpleTitleBar } from "../../lib/factoriojsx/components/TitleBar"
import { L_GuiAssemblySettings } from "../../locale"
import { AssemblyRename, LayerRename } from "./AssemblyRename"

declare global {
  interface PlayerData {
    currentAssemblySettings?: AssemblySettings
  }
}
declare const global: GlobalWithPlayers

const assemblySettingsWidth = 470
@RegisterClass("gui:AssemblySettings")
export class AssemblySettings extends Component<{ assembly: Assembly }> {
  assembly!: Assembly
  playerIndex!: PlayerIndex
  element!: LuaGuiElement
  public override render(props: { assembly: Assembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.playerIndex = tracker.playerIndex

    global.players[this.playerIndex].currentAssemblySettings = this
    tracker.onMount((e) => (this.element = e))
    tracker.getSubscription().add(funcOn(this.onClose))

    return (
      <frame
        direction="vertical"
        auto_center
        styleMod={{
          natural_width: assemblySettingsWidth,
        }}
      >
        <SimpleTitleBar title={[L_GuiAssemblySettings.Title]} />
        <frame style="inside_shallow_frame" direction="vertical">
          <frame style="subheader_frame" direction="horizontal">
            <AssemblyRename assembly={this.assembly} />
            <HorizontalPusher />
            <TrashButton tooltip={[L_GuiAssemblySettings.DeleteAssembly]} onClick={funcOn(this.beginDelete)} />
          </frame>
          <frame style="subheader_frame" direction="horizontal">
            <LayerRename assembly={this.assembly} />
            <HorizontalPusher />
          </frame>

          <frame
            direction="vertical"
            style="bordered_frame_with_extra_side_margins"
            styleMod={{
              margin: 8,
              horizontally_stretchable: true,
            }}
          >
            <label caption="test" />
          </frame>
        </frame>
      </frame>
    )
  }

  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    showDialog(player, {
      title: [L_GuiAssemblySettings.DeleteAssembly],
      message: [
        [L_GuiAssemblySettings.DeleteAssemblyConfirmation1, this.assembly.displayName.get()],
        [L_GuiAssemblySettings.DeleteAssemblyConfirmation2],
        [L_GuiAssemblySettings.DeleteAssemblyConfirmation3],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: funcOn(this.assembly.delete),
    })
  }

  private onClose() {
    delete global.players[this.playerIndex].currentAssemblySettings
  }
}
const AssemblySettingsName = script.mod_name + ":AssemblySettings"

onAssemblyDeleted((assembly: Assembly) => {
  for (const [, { currentAssemblySettings }] of pairs(global.players)) {
    if (currentAssemblySettings && currentAssemblySettings.assembly === assembly) {
      destroy(currentAssemblySettings.element)
    }
  }
})

export function openAssemblySettings(player: LuaPlayer, assembly: Assembly): void {
  const existing = global.players[player.index].currentAssemblySettings
  if (existing && existing.assembly === assembly) existing.element.bring_to_front()

  renderNamed(<AssemblySettings assembly={assembly} />, player.gui.screen, AssemblySettingsName)
}

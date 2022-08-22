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

import { Assembly, LocalAssemblyEvent } from "../../assembly/Assembly"
import { assertNever, funcOn, RegisterClass } from "../../lib"
import { Component, destroy, FactorioJsx, renderNamed, Spec, Tracker } from "../../lib/factoriojsx"
import { TrashButton } from "../../lib/factoriojsx/components/buttons"
import { showDialog } from "../../lib/factoriojsx/components/Dialog"
import { HorizontalPusher, HorizontalSpacer } from "../../lib/factoriojsx/components/misc"
import { SimpleTitleBar } from "../../lib/factoriojsx/components/TitleBar"
import { state } from "../../lib/observable"
import { L_GuiAssemblySettings } from "../../locale"
import { teleportToLayer } from "../player-position"
import { AssemblyRename } from "./AssemblyRename"
import { LayerSelector } from "./LayerSelector"

declare global {
  interface PlayerData {
    currentAssemblySettings?: AssemblySettings
  }
}
declare const global: GlobalWithPlayers

const layerListBoxHeight = 28 * 12
const layerListBoxWidth = 150
const layerSettingsWidth = 300

@RegisterClass("gui:AssemblySettings")
export class AssemblySettings extends Component<{ assembly: Assembly }> {
  assembly!: Assembly
  playerIndex!: PlayerIndex
  element!: LuaGuiElement

  private selectedLayer = state(0)
  public override render(props: { assembly: Assembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.playerIndex = tracker.playerIndex

    global.players[this.playerIndex].currentAssemblySettings = this
    tracker.onMount((e) => (this.element = e))
    tracker.getSubscription().add(funcOn(this.onClose))

    this.assembly.localEvents.subscribe(tracker.getSubscription(), funcOn(this.onAssemblyEvent))

    return (
      <frame direction="vertical" auto_center>
        <SimpleTitleBar title={[L_GuiAssemblySettings.Title]} />

        <frame style="inside_shallow_frame" direction="vertical">
          <frame style="subheader_frame" direction="horizontal">
            <AssemblyRename assembly={this.assembly} />
            <HorizontalPusher />
            <TrashButton tooltip={[L_GuiAssemblySettings.DeleteAssembly]} onClick={funcOn(this.beginDelete)} />
          </frame>
          <flow
            direction="horizontal"
            styleMod={{
              padding: [5, 10],
              vertical_align: "center",
            }}
          >
            <label style="caption_label" caption={[L_GuiAssemblySettings.NewLayer]} />
            <HorizontalSpacer width={10} />
            <button caption={[L_GuiAssemblySettings.AtEnd]} on_gui_click={funcOn(this.addLayer)} />
            <button
              caption={[L_GuiAssemblySettings.InsertAboveCurrent]}
              enabled={this.selectedLayer.gt(0)}
              on_gui_click={funcOn(this.insertLayer)}
            />
          </flow>
        </frame>
        <flow
          direction="horizontal"
          styleMod={{
            horizontal_spacing: 12,
          }}
        >
          <LayerSelector
            uses="list-box"
            styleMod={{
              height: layerListBoxHeight,
              width: layerListBoxWidth,
            }}
            assembly={this.assembly}
            selectedIndex={this.selectedLayer}
          />

          <frame
            style="inside_shallow_frame"
            styleMod={{
              width: layerSettingsWidth,
              vertically_stretchable: true,
              padding: 12,
            }}
          >
            <label caption={"Interesting settings go here"} />
          </frame>
        </flow>
      </frame>
    )
  }

  private onClose() {
    destroy(this.element)
    delete global.players[this.playerIndex].currentAssemblySettings
  }

  private onAssemblyEvent(_: any, event: LocalAssemblyEvent) {
    if (event.type === "assembly-deleted") {
      this.onClose()
    } else if (event.type !== "layer-added") {
      assertNever(event)
    }
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

  private insertLayer() {
    this.doInsertLayer(this.selectedLayer.get())
  }

  private addLayer() {
    this.doInsertLayer(this.assembly.numLayers() + 1)
  }
  private doInsertLayer(index: number) {
    if (!this.assembly.valid) return
    const layer = this.assembly.insertLayer(index)
    teleportToLayer(game.get_player(this.playerIndex)!, layer)
  }
}
const AssemblySettingsName = script.mod_name + ":AssemblySettings"

export function openAssemblySettings(player: LuaPlayer, assembly: Assembly): void {
  const existing = global.players[player.index].currentAssemblySettings
  if (existing && existing.assembly === assembly) existing.element.bring_to_front()

  renderNamed(<AssemblySettings assembly={assembly} />, player.gui.screen, AssemblySettingsName)
}

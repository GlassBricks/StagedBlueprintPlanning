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

import { Assembly, Layer, LocalAssemblyEvent } from "../../assembly/AssemblyDef"
import { AssemblyOperations } from "../../assembly/AssemblyOperations"
import { assertNever, funcOn, RegisterClass } from "../../lib"
import { Component, destroy, FactorioJsx, renderNamed, Spec, Tracker } from "../../lib/factoriojsx"
import { TrashButton } from "../../lib/factoriojsx/components/buttons"
import { showDialog } from "../../lib/factoriojsx/components/Dialog"
import { Fn } from "../../lib/factoriojsx/components/Fn"
import { HorizontalPusher } from "../../lib/factoriojsx/components/misc"
import { SimpleTitleBar } from "../../lib/factoriojsx/components/TitleBar"
import { Pos } from "../../lib/geometry"
import { state } from "../../lib/observable"
import { L_GuiAssemblySettings } from "../../locale"
import { teleportToLayer, teleportToSurface1 } from "../player-position"
import { ItemRename } from "./ItemRename"
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
    tracker.getSubscription().add(funcOn(this.onDestroyed))

    this.assembly.localEvents.subscribe(tracker.getSubscription(), funcOn(this.onAssemblyEvent))

    return (
      <frame direction="vertical">
        <SimpleTitleBar title={[L_GuiAssemblySettings.Title]} onClose={funcOn(this.onClose)} />

        <frame style="inside_shallow_frame" direction="vertical">
          <frame style="subheader_frame" direction="horizontal">
            <ItemRename
              name={this.assembly.name}
              displayName={this.assembly.displayName}
              renameTooltip={[L_GuiAssemblySettings.RenameAssembly]}
            />
            <HorizontalPusher />
            <TrashButton tooltip={[L_GuiAssemblySettings.DeleteAssembly]} on_gui_click={funcOn(this.beginDelete)} />
          </frame>
          <flow
            direction="horizontal"
            styleMod={{
              padding: [5, 10],
              vertical_align: "center",
            }}
          >
            <label
              style="caption_label"
              caption={[L_GuiAssemblySettings.NewLayer]}
              styleMod={{
                right_margin: 10,
              }}
            />
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

          <Fn
            uses="frame"
            from={this.selectedLayer}
            map={funcOn(this.renderLayerSettings)}
            direction="vertical"
            style="inside_shallow_frame"
            styleMod={{
              width: layerSettingsWidth,
              vertically_stretchable: true,
            }}
          />
        </flow>
      </frame>
    )
  }

  private onDestroyed() {
    delete global.players[this.playerIndex].currentAssemblySettings
  }

  private onClose() {
    this.element.visible = false
  }

  private onAssemblyEvent(_: any, event: LocalAssemblyEvent) {
    if (event.type === "assembly-deleted") {
      destroy(this.element)
    } else if (event.type !== "layer-added" && event.type !== "pre-layer-deleted" && event.type !== "layer-deleted") {
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
      onConfirm: funcOn(this.deleteAssembly),
    })
  }

  private deleteAssembly() {
    this.assembly.delete()
    teleportToSurface1(game.get_player(this.playerIndex)!)
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

  private renderLayerSettings(selectedLayerIndex: number): Spec | nil {
    const layer = this.assembly.getLayer(selectedLayerIndex)
    if (!layer) return nil
    return <LayerSettings layer={layer} />
  }
}

@RegisterClass("gui:LayerSettings")
export class LayerSettings extends Component<{ layer: Layer }> {
  playerIndex!: PlayerIndex
  layer!: Layer
  public override render(props: { layer: Layer }, tracker: Tracker): Spec {
    this.layer = props.layer
    this.playerIndex = tracker.playerIndex

    const canDeleteLayer = this.layer.layerNumber > 1

    return (
      <>
        <frame style="subheader_frame" direction="horizontal">
          <ItemRename
            name={props.layer.name}
            displayName={props.layer.name}
            renameTooltip={[L_GuiAssemblySettings.RenameLayer]}
          />
          <HorizontalPusher />
          <TrashButton
            enabled={canDeleteLayer}
            tooltip={
              canDeleteLayer ? [L_GuiAssemblySettings.DeleteLayer] : [L_GuiAssemblySettings.CannotDeleteFirstLayer]
            }
            on_gui_click={funcOn(this.beginDelete)}
          />
        </frame>
        <scroll-pane
          style="naked_scroll_pane"
          styleMod={{
            padding: [5, 10],
            vertically_stretchable: true,
            horizontally_stretchable: true,
          }}
          horizontal_scroll_policy="never"
        >
          <button
            caption={[L_GuiAssemblySettings.ResetLayer]}
            tooltip={[L_GuiAssemblySettings.ResetLayerTooltip]}
            on_gui_click={funcOn(this.resetLayer)}
          />
        </scroll-pane>
      </>
    )
  }

  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const layerNumber = this.layer.layerNumber
    if (layerNumber <= 1) return // can't delete the first layer
    const previousLayer = this.layer.assembly.getLayer(layerNumber - 1)
    if (!previousLayer) return
    showDialog(player, {
      title: [L_GuiAssemblySettings.DeleteLayer],
      message: [
        [L_GuiAssemblySettings.DeleteLayerConfirmation1, this.layer.name.get()],
        [L_GuiAssemblySettings.DeleteLayerConfirmation2, previousLayer.name.get()],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: funcOn(this.deleteLayer),
    })
  }
  private deleteLayer() {
    const previousLayer = this.layer.assembly.getLayer(this.layer.layerNumber - 1)
    if (!previousLayer) return
    this.layer.deleteInAssembly()
    teleportToLayer(game.get_player(this.playerIndex)!, previousLayer)
  }

  private resetLayer() {
    AssemblyOperations.resetLayer(this.layer.assembly, this.layer)
  }
}

const AssemblySettingsName = script.mod_name + ":AssemblySettings"
const defaultLocation = Pos(20, 200)
export function openAssemblySettings(player: LuaPlayer, assembly: Assembly): void {
  const existing = global.players[player.index].currentAssemblySettings
  const existingValid = existing && existing.element.valid
  if (existingValid && existing.assembly === assembly) {
    existing.element.visible = true
    existing.element.bring_to_front()
  } else {
    const location = existingValid ? existing.element.location : defaultLocation
    const element = renderNamed(
      <AssemblySettings assembly={assembly} />,
      player.gui.screen,
      AssemblySettingsName,
    ) as FrameGuiElement
    element.location = location
    element.bring_to_front()
  }
}

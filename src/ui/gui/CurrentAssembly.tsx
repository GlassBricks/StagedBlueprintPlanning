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

import { Assembly, Layer } from "../../assembly/AssemblyDef"
import { funcOn, funcRef, onPlayerInit, RegisterClass } from "../../lib"
import { Component, EmptyProps, FactorioJsx, renderNamed, Spec, Tracker } from "../../lib/factoriojsx"
import { Fn } from "../../lib/factoriojsx/components/Fn"
import { HorizontalPusher } from "../../lib/factoriojsx/components/misc"
import { TitleBar } from "../../lib/factoriojsx/components/TitleBar"
import { MaybeState } from "../../lib/observable"
import { L_GuiCurrentAssembly } from "../../locale"
import { playerCurrentLayer } from "../player-position"
import { openAssemblySettings } from "./AssemblySettings"
import { ExternalLinkButton } from "./buttons"
import { LayerSelector } from "./LayerSelector"

const CurrentAssemblyWidth = 260
@RegisterClass("gui:CurrentAssembly")
class CurrentAssembly extends Component {
  static mapLayerToAssemblyTitle(this: void, layer: Layer | nil): MaybeState<LocalisedString> {
    if (layer === nil) return [L_GuiCurrentAssembly.NoAssembly]
    return layer.assembly.displayName
  }
  static mapAssemblyToContent(this: void, assembly: Assembly | nil) {
    return assembly && <LayerSelector uses="drop-down" assembly={assembly} styleMod={{ width: CurrentAssemblyWidth }} />
  }
  public override render(_: EmptyProps, tracker: Tracker): Spec {
    const { playerIndex } = tracker
    const currentLayer = playerCurrentLayer(playerIndex)

    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            style="frame_title"
            styleMod={{
              font: "heading-2",
              width: CurrentAssemblyWidth - 40,
            }}
            caption={currentLayer.flatMap(funcRef(CurrentAssembly.mapLayerToAssemblyTitle))}
          />
          <HorizontalPusher />
          <ExternalLinkButton
            tooltip={[L_GuiCurrentAssembly.OpenAssemblySettings]}
            enabled={currentLayer.truthy()}
            on_gui_click={funcOn(this.openAssemblySettings)}
          />
        </TitleBar>
        <Fn
          uses="flow"
          from={currentLayer.nullableSub("assembly")}
          map={funcRef(CurrentAssembly.mapAssemblyToContent)}
        />
      </frame>
    )
  }

  private openAssemblySettings(event: OnGuiClickEvent) {
    const { player_index } = event
    const currentLayer = playerCurrentLayer(player_index).get()
    if (currentLayer === nil) return
    const assembly = currentLayer.assembly
    openAssemblySettings(game.get_player(player_index)!, assembly)
  }
}

const currentAssemblyName = script.mod_name + ":current-assembly"
onPlayerInit((index) => {
  const player = game.get_player(index)!
  renderNamed(<CurrentAssembly />, player.gui.left, currentAssemblyName)
})

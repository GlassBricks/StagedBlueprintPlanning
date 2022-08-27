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

import { Assembly, Stage } from "../../assembly/AssemblyDef"
import { funcOn, funcRef, MaybeState, onPlayerInit, RegisterClass, registerFunctions } from "../../lib"
import { Component, EmptyProps, FactorioJsx, renderNamed, Spec, Tracker } from "../../lib/factoriojsx"
import { DotDotDotButton, Fn, HorizontalPusher, HorizontalSpacer, TitleBar } from "../../lib/factoriojsx/components"
import { L_GuiCurrentAssembly } from "../../locale"
import { playerCurrentStage } from "../player-current-stage"
import { openAllAssemblies } from "./AllAssemblies"
import { openAssemblySettings } from "./AssemblySettings"
import { ExternalLinkButton } from "./buttons"
import { StageSelector } from "./StageSelector"

const CurrentAssemblyWidth = 260
@RegisterClass("gui:CurrentAssembly")
class CurrentAssembly extends Component {
  private static mapStageToAssemblyTitle(this: void, stage: Stage | nil): MaybeState<LocalisedString> {
    if (stage === nil) return [L_GuiCurrentAssembly.NoAssembly]
    return stage.assembly.displayName
  }
  private static mapAssemblyToContent(this: void, assembly: Assembly | nil) {
    return assembly ? (
      <StageSelector uses="drop-down" assembly={assembly} styleMod={{ width: CurrentAssemblyWidth }} />
    ) : (
      <HorizontalSpacer width={CurrentAssemblyWidth} />
    )
  }
  public override render(_: EmptyProps, tracker: Tracker): Spec {
    const { playerIndex } = tracker
    const currentStage = playerCurrentStage(playerIndex)

    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            style="frame_title"
            styleMod={{
              font: "heading-2",
              width: CurrentAssemblyWidth - 80,
            }}
            caption={currentStage.flatMap(funcRef(CurrentAssembly.mapStageToAssemblyTitle))}
          />
          <HorizontalPusher />
          <ExternalLinkButton
            tooltip={[L_GuiCurrentAssembly.OpenAssemblySettings]}
            enabled={currentStage.truthy()}
            on_gui_click={funcOn(this.openAssemblySettings)}
          />
          <DotDotDotButton
            tooltip={[L_GuiCurrentAssembly.ShowAllAssemblies]}
            on_gui_click={funcRef(onOpenAllAssembliesClicked)}
          />
        </TitleBar>
        <Fn
          uses="flow"
          from={currentStage.nullableSub("assembly")}
          map={funcRef(CurrentAssembly.mapAssemblyToContent)}
        />
      </frame>
    )
  }

  private openAssemblySettings(event: OnGuiClickEvent) {
    const { player_index } = event
    const currentStage = playerCurrentStage(player_index).get()
    if (currentStage === nil) return
    const assembly = currentStage.assembly
    openAssemblySettings(game.get_player(player_index)!, assembly)
  }
}
function onOpenAllAssembliesClicked(event: OnGuiClickEvent) {
  const { player_index } = event
  const player = game.get_player(player_index)
  if (player) {
    openAllAssemblies(player)
  }
}
registerFunctions("gui:CurrentAssembly", {
  onOpenAllAssembliesClicked,
})

const currentAssemblyName = script.mod_name + ":current-assembly"
onPlayerInit((index) => {
  const player = game.get_player(index)!
  renderNamed(<CurrentAssembly />, player.gui.left, currentAssemblyName)
})

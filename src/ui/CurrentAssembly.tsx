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

import { AssemblyEvents } from "../assembly/Assembly"
import { Assembly, Stage } from "../assembly/AssemblyDef"
import { getAllAssemblies } from "../assembly/global"
import { bind, funcOn, funcRef, MaybeState, onPlayerInit, RegisterClass, registerFunctions, Subscription } from "../lib"
import { Component, destroy, EmptyProps, FactorioJsx, render, renderNamed, Spec, Tracker } from "../lib/factoriojsx"
import { DotDotDotButton, Fn, HorizontalPusher, HorizontalSpacer, TitleBar } from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiAllAssemblies, L_GuiCurrentAssembly } from "../locale"
import { openAssemblySettings } from "./AssemblySettings"
import { ExternalLinkButton } from "./buttons"
import { openNewAssemblyGui } from "./NewAssembly"
import { playerCurrentStage } from "./player-current-stage"
import { StageSelector } from "./StageSelector"

declare global {
  interface PlayerData {
    currentAssemblyGui?: CurrentAssembly
  }
}
declare const global: GlobalWithPlayers

const CurrentAssemblyWidth = 260
@RegisterClass("gui:CurrentAssembly")
class CurrentAssembly extends Component {
  mainFlow!: FlowGuiElement

  public override render(_: EmptyProps, tracker: Tracker): Spec {
    const { playerIndex } = tracker
    global.players[playerIndex].currentAssemblyGui = this

    const currentStage = playerCurrentStage(playerIndex)

    return (
      <flow direction="vertical" styleMod={{ vertical_spacing: 0 }} onCreate={(e) => (this.mainFlow = e)}>
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
      </flow>
    )
  }
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

  private openAssemblySettings(event: OnGuiClickEvent) {
    const { player_index } = event
    const currentStage = playerCurrentStage(player_index).get()
    if (currentStage === nil) return
    const assembly = currentStage.assembly
    openAssemblySettings(game.get_player(player_index)!, assembly)
  }
}
const currentAssemblyName = script.mod_name + ":current-assembly"
function rerenderCurrentAssembly(player: LuaPlayer): void {
  renderNamed(<CurrentAssembly />, player.gui.left, currentAssemblyName)
}
onPlayerInit((index) => {
  const player = game.get_player(index)!
  rerenderCurrentAssembly(player)
})
Migrations.fromAny(() => {
  for (const [, player] of game.players) rerenderCurrentAssembly(player)
})

const AllAssembliesName = "all-assemblies"

const AllAssembliesWidth = CurrentAssemblyWidth
const AllAssembliesHeight = 28 * 10
@RegisterClass("gui:AllAssemblies")
class AllAssemblies extends Component {
  playerIndex!: PlayerIndex

  listBox!: ListBoxGuiElement
  allAssemblies!: Assembly[]

  public override render(_: EmptyProps, tracker: Tracker): Spec {
    this.playerIndex = tracker.playerIndex
    const subscription = tracker.getSubscription()
    return (
      <frame direction="vertical" name={AllAssembliesName}>
        <list-box
          name="assemblies"
          style="list_box"
          styleMod={{
            width: AllAssembliesWidth,
            height: AllAssembliesHeight,
          }}
          onCreate={(e) => {
            this.listBox = e
            this.setup(subscription)
          }}
          on_gui_selection_state_changed={funcOn(this.assemblySelected)}
        />
        <button caption={[L_GuiAllAssemblies.NewAssembly]} on_gui_click={funcOn(this.newAssembly)} />
      </frame>
    )
  }

  private setup(subscription: Subscription): void {
    const listBox = this.listBox
    this.allAssemblies = Object.values(getAllAssemblies())
    listBox.items = this.allAssemblies.map((a) => a.displayName.get())

    for (const [i, assembly] of ipairs(this.allAssemblies)) {
      assembly.displayName.subscribe(subscription, bind(AllAssemblies.onAssemblyNameChange, this, i))
    }
  }
  private static onAssemblyNameChange(
    this: void,
    self: AllAssemblies,
    index: number,
    _: any,
    name: LocalisedString,
  ): void {
    self.listBox.set_item(index, name)
  }

  private assemblySelected(): void {
    const assembly = this.allAssemblies[this.listBox.selected_index - 1]
    if (assembly !== nil) {
      closeAllAssemblies(this.playerIndex)
      openAssemblySettings(game.get_player(this.playerIndex)!, assembly)
    } else {
      this.listBox.selected_index = 0
    }
  }

  private newAssembly(): void {
    closeAllAssemblies(this.playerIndex)
    openNewAssemblyGui(game.get_player(this.playerIndex)!)
  }
}

function getCurrentAssemblyGui(playerIndex: PlayerIndex): CurrentAssembly {
  const currentAssemblyGui = global.players[playerIndex].currentAssemblyGui
  if (currentAssemblyGui !== nil) return currentAssemblyGui

  rerenderCurrentAssembly(game.get_player(playerIndex)!)
  return assert(global.players[playerIndex].currentAssemblyGui!)
}

export function closeAllAssemblies(playerIndex: PlayerIndex): void {
  const flow = getCurrentAssemblyGui(playerIndex).mainFlow
  destroy(flow[AllAssembliesName])
}
function rerenderAllAssemblies(playerIndex: PlayerIndex): void {
  const flow = getCurrentAssemblyGui(playerIndex).mainFlow
  destroy(flow[AllAssembliesName])
  render(<AllAssemblies />, flow, 2)
}
function toggleAllAssemblies(playerIndex: PlayerIndex): void {
  const flow = getCurrentAssemblyGui(playerIndex).mainFlow
  const allAssemblies = flow[AllAssembliesName]
  if (allAssemblies) {
    destroy(allAssemblies)
  } else {
    render(<AllAssemblies />, flow, 2)
  }
}
function rerenderAllAssembliesIfOpen(playerIndex: PlayerIndex): void {
  const flow = getCurrentAssemblyGui(playerIndex).mainFlow
  if (flow[AllAssembliesName]) rerenderAllAssemblies(playerIndex)
}

function onOpenAllAssembliesClicked(event: OnGuiClickEvent) {
  toggleAllAssemblies(event.player_index)
}
registerFunctions("gui:CurrentAssembly", { onOpenAllAssembliesClicked })

AssemblyEvents.addListener((e) => {
  if (e.type === "assembly-created" || e.type === "assembly-deleted") {
    for (const [, player] of game.players) {
      rerenderAllAssembliesIfOpen(player.index)
    }
  }
})

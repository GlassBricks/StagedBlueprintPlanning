/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { UserAssembly } from "../assembly/AssemblyDef"
import { getAllAssemblies } from "../assembly/migrations"
import { AssemblyEvents, createUserAssembly } from "../assembly/UserAssembly"
import { bind, funcRef, ibind, onPlayerInitSince, RegisterClass, registerFunctions, Subscription } from "../lib"
import { Component, destroy, EmptyProps, FactorioJsx, RenderContext, renderNamed, Spec } from "../lib/factoriojsx"
import { Migrations } from "../lib/migration"
import * as mod_gui from "mod-gui"
import { L_GuiAssemblySelector } from "../locale"
import { teleportToAssembly } from "./player-current-stage"
import { Sprites } from "../constants"
import { bringSettingsWindowToFront } from "./AssemblySettings"

declare const global: GlobalWithPlayers

function ModButton() {
  return (
    <sprite-button
      style={mod_gui.button_style}
      sprite={Sprites.BlueprintStages}
      tooltip={[L_GuiAssemblySelector.ShowAllAssemblies]}
      on_gui_click={funcRef(onModButtonClick)}
    />
  )
}

const ModButtonName = script.mod_name + ":all-assemblies"
onPlayerInitSince("0.15.1", (playerIndex) => {
  const player = game.get_player(playerIndex)!
  renderNamed(<ModButton />, mod_gui.get_button_flow(player), ModButtonName)
})

const AllAssembliesName = script.mod_name + ":all-assemblies"
const AllAssembliesWidth = 260
const AllAssembliesHeight = 28 * 10
@RegisterClass("gui:AllAssemblies")
class AllAssemblies extends Component {
  playerIndex!: PlayerIndex

  listBox!: ListBoxGuiElement
  allAssemblies!: UserAssembly[]

  public override render(_: EmptyProps, context: RenderContext): Spec {
    this.playerIndex = context.playerIndex
    const subscription = context.getSubscription()
    return (
      <frame direction="vertical" caption={[L_GuiAssemblySelector.AllAssemblies]}>
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
          on_gui_selection_state_changed={ibind(this.assemblySelected)}
        />
        <button caption={[L_GuiAssemblySelector.NewAssembly]} on_gui_click={ibind(this.newAssembly)} />
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
    if (assembly != nil) {
      closeAllAssemblies(this.playerIndex)
      const player = game.get_player(this.playerIndex)!
      teleportToAssembly(player, assembly)
      bringSettingsWindowToFront(player)
    } else {
      this.listBox.selected_index = 0
    }
  }

  private newAssembly(): void {
    closeAllAssemblies(this.playerIndex)
    createNewAssembly(game.get_player(this.playerIndex)!)
  }
}

function getFrameFlow(playerIndex: PlayerIndex) {
  return mod_gui.get_frame_flow(game.get_player(playerIndex)!)
}
export function closeAllAssemblies(playerIndex: PlayerIndex): void {
  destroy(getFrameFlow(playerIndex)[AllAssembliesName])
}
function toggleAllAssemblies(playerIndex: PlayerIndex): void {
  const flow = getFrameFlow(playerIndex)
  const allAssemblies = flow[AllAssembliesName]
  if (allAssemblies) {
    destroy(allAssemblies)
  } else {
    renderNamed(<AllAssemblies />, flow, AllAssembliesName)
  }
}
function rerenderAllAssembliesIfOpen(playerIndex: PlayerIndex): void {
  const flow = getFrameFlow(playerIndex)
  if (flow[AllAssembliesName]) renderNamed(<AllAssemblies />, flow, AllAssembliesName)
}

function onModButtonClick(event: OnGuiClickEvent) {
  toggleAllAssemblies(event.player_index)
}
registerFunctions("gui:assembly-selector", { onModButtonClick })

AssemblyEvents.addListener((e) => {
  if (e.type == "assembly-created" || e.type == "assembly-deleted") {
    for (const [, player] of game.players) {
      rerenderAllAssembliesIfOpen(player.index)
    }
  }
})

function createNewAssembly(player: LuaPlayer): void {
  const assembly = createUserAssembly("", 5)
  teleportToAssembly(player, assembly)
}

Migrations.to("0.15.1", () => {
  interface OldPlayerData {
    currentAssemblyGui?: {
      mainFlow?: LuaGuiElement
    }
  }
  for (const [, playerData] of pairs(global.players)) {
    const oldPlayerData = playerData as OldPlayerData
    destroy(oldPlayerData?.currentAssemblyGui?.mainFlow)
  }
})

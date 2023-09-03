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

import {
  ButtonGuiElement,
  LuaGuiElement,
  LuaPlayer,
  OnGuiClickEvent,
  PlayerIndex,
  ScrollPaneGuiElement,
} from "factorio:runtime"
import * as mod_gui from "mod-gui"
import {
  AssembliesReorderedEvent,
  AssemblyCreatedEvent,
  AssemblyDeletedEvent,
  UserAssembly,
} from "../assembly/AssemblyDef"
import {
  AssemblyEvents,
  createUserAssembly,
  getAllAssemblies,
  moveAssemblyDown,
  moveAssemblyUp,
} from "../assembly/UserAssembly"
import { OtherConstants, Sprites, Styles } from "../constants"
import { bind, funcRef, ibind, onPlayerInitSince, RegisterClass, registerFunctions } from "../lib"
import {
  Component,
  destroy,
  destroyChildren,
  Element,
  EmptyProps,
  FactorioJsx,
  getComponentInstance,
  render,
  RenderContext,
  renderNamed,
} from "../lib/factoriojsx"
import { SimpleTitleBar } from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiAssemblySelector } from "../locale"
import { bringSettingsWindowToFront } from "./AssemblySettings"
import { exitAssembly, PlayerChangedStageEvent, playerCurrentStage, teleportToAssembly } from "./player-current-stage"
import mouse_button_type = defines.mouse_button_type

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
  scrollPane!: ScrollPaneGuiElement
  backToNauvisButton!: ButtonGuiElement

  public override render(_: EmptyProps, context: RenderContext): Element {
    this.playerIndex = context.playerIndex
    const currentStage = playerCurrentStage(this.playerIndex)
    return (
      <frame direction="vertical">
        <SimpleTitleBar title={[L_GuiAssemblySelector.AllAssemblies]} />
        <scroll-pane
          style={Styles.FakeListBox}
          styleMod={{
            width: AllAssembliesWidth,
            height: AllAssembliesHeight,
          }}
          onCreate={(e) => {
            this.scrollPane = e
            this.scrollToCurrentAssembly()
          }}
        >
          {getAllAssemblies().map((assembly) => this.assemblyButtonFlow(assembly))}
        </scroll-pane>
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <button caption={[L_GuiAssemblySelector.NewAssembly]} on_gui_click={ibind(this.newAssembly)} />
          <button
            caption={[L_GuiAssemblySelector.ExitAssembly]}
            enabled={currentStage.truthy()}
            on_gui_click={ibind(this.backToNauvis)}
          />
        </flow>
      </frame>
    )
  }

  private assemblyButtonFlow(assembly: UserAssembly) {
    return <flow tags={{ assemblyId: assembly.id }}>{this.assemblyButton(assembly)}</flow>
  }

  private assemblyButton(assembly: UserAssembly) {
    const currentAssembly = playerCurrentStage(this.playerIndex).get()?.assembly
    return (
      <button
        style={assembly == currentAssembly ? Styles.FakeListBoxItemActive : Styles.FakeListBoxItem}
        caption={assembly.displayName}
        tooltip={[L_GuiAssemblySelector.ButtonTooltip]}
        on_gui_click={bind(AllAssemblies.onButtonClick, assembly)}
      />
    )
  }

  private scrollToCurrentAssembly() {
    const currentAssembly = playerCurrentStage(this.playerIndex).get()?.assembly
    if (!currentAssembly) return
    const element = this.scrollPane
    if (!element || !element.valid) return
    const flow = this.scrollPane.children.find((c) => c.tags?.assemblyId == currentAssembly.id)
    if (flow) {
      element.scroll_to_element(flow)
    }
  }

  private static onButtonClick(this: void, assembly: UserAssembly, event: OnGuiClickEvent): void {
    // control left-click: move up
    // control right-click: move down
    // normal click: teleport
    if (event.control) {
      if (event.button == mouse_button_type.left) {
        moveAssemblyUp(assembly)
      } else if (event.button == mouse_button_type.right) {
        moveAssemblyDown(assembly)
      }
      return
    }
    const playerIndex = event.player_index
    const player = game.get_player(playerIndex)!
    // closeAllAssemblies(playerIndex)
    teleportToAssembly(player, assembly)
    bringSettingsWindowToFront(player)
  }

  private newAssembly(): void {
    closeAllAssemblies(this.playerIndex)
    createNewAssembly(game.get_player(this.playerIndex)!)
  }

  private backToNauvis(): void {
    closeAllAssemblies(this.playerIndex)
    exitAssembly(game.get_player(this.playerIndex)!)
  }

  assemblyChangedEvent(e: AssemblyCreatedEvent | AssemblyDeletedEvent | AssembliesReorderedEvent) {
    const element = this.scrollPane
    if (!element || !element.valid) return
    if (e.type == "assembly-created") {
      render(this.assemblyButtonFlow(e.assembly), element)
      this.scrollToCurrentAssembly()
    } else if (e.type == "assembly-deleted") {
      const flow = element.children.find((c) => c.tags.assemblyId == e.assembly.id)
      if (flow) destroy(flow)
    } else if (e.type == "assemblies-reordered") {
      const children = element.children
      const index1 = children.findIndex((c) => c.tags.assemblyId == e.assembly1.id)
      const index2 = children.findIndex((c) => c.tags.assemblyId == e.assembly2.id)
      if (index1 == -1 || index2 == -1) return
      element.swap_children(index1 + 1, index2 + 1)
      this.scrollToCurrentAssembly()
    }
  }

  private rerenderAssembly(assembly: UserAssembly) {
    const element = this.scrollPane
    if (!element || !element.valid) return
    const flow = element.children.find((c) => c.tags.assemblyId == assembly.id)
    if (flow) {
      destroyChildren(flow)
      render(this.assemblyButton(assembly), flow)
    }
  }

  playerAssemblyChanged(oldAssembly: UserAssembly | nil, newAssembly: UserAssembly | nil) {
    if (oldAssembly) this.rerenderAssembly(oldAssembly)
    if (newAssembly) this.rerenderAssembly(newAssembly)
    this.scrollToCurrentAssembly()
  }
}

function createNewAssembly(player: LuaPlayer): void {
  const assembly = createUserAssembly("", OtherConstants.DefaultNumStages)
  global.players[player.index].compactAssemblySettings = nil
  teleportToAssembly(player, assembly)
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
function onModButtonClick(event: OnGuiClickEvent) {
  toggleAllAssemblies(event.player_index)
}
registerFunctions("gui:assembly-selector", { onModButtonClick })

AssemblyEvents.addListener((e) => {
  if (e.type == "assembly-created" || e.type == "assembly-deleted" || e.type == "assemblies-reordered") {
    for (const [, player] of game.players) {
      const element = getFrameFlow(player.index)[AllAssembliesName]
      if (!element) continue
      const component = getComponentInstance<AllAssemblies>(element)
      if (component) component.assemblyChangedEvent(e)
    }
  }
})
PlayerChangedStageEvent.addListener((player, oldStage, newStage) => {
  const oldAssembly = oldStage?.assembly
  const newAssembly = newStage?.assembly
  if (oldAssembly != newAssembly) {
    const element = getFrameFlow(player.index)[AllAssembliesName]
    if (!element) return
    const component = getComponentInstance<AllAssemblies>(element)
    if (component) component.playerAssemblyChanged(oldAssembly, newAssembly)
  }
})

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
Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    closeAllAssemblies(player.index)
    const flow = mod_gui.get_button_flow(player)
    if (flow[ModButtonName] == nil) renderNamed(<ModButton />, flow, ModButtonName)
  }
})

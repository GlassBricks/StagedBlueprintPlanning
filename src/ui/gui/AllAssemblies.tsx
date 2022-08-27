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

import { AssemblyEvents, getAllAssemblies } from "../../assembly/Assembly"
import { Assembly } from "../../assembly/AssemblyDef"
import { bind, funcOn, funcRef, RegisterClass, state, Subscription } from "../../lib"
import {
  Component,
  destroy,
  destroyOnClose,
  EmptyProps,
  FactorioJsx,
  renderOpened,
  Spec,
  Tracker,
} from "../../lib/factoriojsx"
import { SimpleTitleBar } from "../../lib/factoriojsx/components"
import { L_GuiAllAssemblies } from "../../locale"
import { openAssemblySettings } from "./AssemblySettings"
import { openNewAssemblyGui } from "./NewAssembly"

const AllAssembliesWidth = 300
const AllAssembliesHeight = 28 * 10
@RegisterClass("gui:AllAssemblies")
class AllAssemblies extends Component {
  playerIndex!: PlayerIndex

  element!: LuaGuiElement
  listBox!: ListBoxGuiElement
  allAssemblies!: Assembly[]

  public override render(_: EmptyProps, tracker: Tracker): Spec {
    this.playerIndex = tracker.playerIndex
    const subscription = tracker.getSubscription()
    tracker.onMount((e) => (this.element = e))
    const selectedIndex = state(0)
    selectedIndex.subscribe(subscription, funcOn(this.assemblySelected))
    return (
      <frame
        direction="vertical"
        auto_center
        on_gui_closed={funcRef(destroyOnClose)}
        tags={{
          isAllAssembliesGui: true,
        }}
      >
        <SimpleTitleBar title={[L_GuiAllAssemblies.Title]} />
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
          selected_index={selectedIndex}
        />
        <button caption={[L_GuiAllAssemblies.NewAssembly]} on_gui_click={funcOn(this.newAssembly)} />
      </frame>
    )
  }

  private setup(subscription: Subscription): void {
    const listBox = this.listBox
    this.allAssemblies = getAllAssemblies()
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

  private assemblySelected(_: any, index: number): void {
    const assembly = this.allAssemblies[index - 1]
    if (assembly !== nil) {
      destroy(this.element)
      openAssemblySettings(game.get_player(this.playerIndex)!, assembly)
    } else {
      this.listBox.selected_index = 0
    }
  }

  private newAssembly(): void {
    openNewAssemblyGui(game.get_player(this.playerIndex)!)
  }
}

export function openAllAssemblies(player: LuaPlayer): void {
  renderOpened(player, { type: AllAssemblies, props: {} })
}

AssemblyEvents.addListener((e) => {
  if (e.type === "assembly-created" || e.type === "assembly-deleted") {
    for (const [, player] of game.players) {
      const opened = player.opened
      if (opened && opened.object_name === "LuaGuiElement" && opened.tags.isAllAssembliesGui) {
        destroy(opened)
        openAllAssemblies(player)
      }
    }
  }
})

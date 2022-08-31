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

import { createAssembly } from "../../assembly/Assembly"
import { funcOn, RegisterClass } from "../../lib"
import { Component, destroy, EmptyProps, FactorioJsx, renderOpened, Spec, Tracker } from "../../lib/factoriojsx"
import { HorizontalPusher, SimpleTitleBar } from "../../lib/factoriojsx/components"
import { L_GuiNewAssembly } from "../../locale"
import { openAssemblySettings } from "./AssemblySettings"
import floor = math.floor

export function openNewAssemblyGui(player: LuaPlayer): void {
  renderOpened(player, <NewAssembly />)
}

const guiWidth = 300
@RegisterClass("gui:NewAssemblyGui")
class NewAssembly extends Component {
  element!: LuaGuiElement
  name!: TextFieldGuiElement
  numStages!: TextFieldGuiElement
  override render(props: EmptyProps, tracker: Tracker): Spec {
    return (
      <frame
        direction="vertical"
        styleMod={{
          natural_width: guiWidth,
        }}
        auto_center
        onCreate={(e) => (this.element = e)}
      >
        <SimpleTitleBar title={[L_GuiNewAssembly.Title]} />
        <frame direction="vertical" style="bordered_frame">
          <flow direction="horizontal" style="player_input_horizontal_flow">
            <label caption={[L_GuiNewAssembly.Name]} />
            <HorizontalPusher />
            <textfield lose_focus_on_confirm onCreate={(e) => (this.name = e)} />
          </flow>
          <flow direction="horizontal" style="player_input_horizontal_flow">
            <label caption={[L_GuiNewAssembly.InitialNumStages]} />
            <HorizontalPusher />
            <textfield
              style="short_number_textfield"
              text="5"
              numeric
              clear_and_focus_on_right_click
              lose_focus_on_confirm
              onCreate={(e) => (this.numStages = e)}
            />
          </flow>
          <flow direction="horizontal">
            <HorizontalPusher />
            <button style="button" caption={[L_GuiNewAssembly.Create]} on_gui_click={funcOn(this.create)} />
          </flow>
        </frame>
      </frame>
    )
  }
  create() {
    const player = game.get_player(this.element.player_index)!
    const name = this.name.text.trim()
    const numStages = tonumber(this.numStages.text)
    if (!numStages || numStages <= 0) {
      this.notifyPlayer(player, [L_GuiNewAssembly.InvalidNumStages])
      return
    }
    destroy(this.element)

    tryCreateAssembly(player, name, floor(numStages))
  }

  notifyPlayer(player: LuaPlayer, message: LocalisedString) {
    player.create_local_flying_text({
      text: message,
      create_at_cursor: true,
    })
  }
}

function tryCreateAssembly(player: LuaPlayer, name: string, numStages: number) {
  const assembly = createAssembly(name, numStages)
  openAssemblySettings(player, assembly)
}

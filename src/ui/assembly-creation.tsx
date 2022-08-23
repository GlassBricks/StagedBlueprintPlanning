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

import { userCreateAssembly } from "../assembly/Assembly"
import { Assembly } from "../assembly/AssemblyDef"
import { findIntersectingAssembly } from "../assembly/world-register"
import { Colors, Prototypes } from "../constants"
import { Events, funcOn, noSelfFuncOn, RegisterClass } from "../lib"
import { Component, destroy, FactorioJsx, render, Spec, Tracker } from "../lib/factoriojsx"
import { HorizontalPusher } from "../lib/factoriojsx/components/misc"
import { SimpleTitleBar } from "../lib/factoriojsx/components/TitleBar"
import { BBox } from "../lib/geometry"
import draw, { RectangleRender } from "../lib/rendering"
import { L_GuiNewAssembly, L_Interaction } from "../locale"
import { openAssemblySettings } from "./gui/AssemblySettings"
import floor = math.floor

function notifyIntersectingAssembly(player: LuaPlayer, assembly: Assembly) {
  notifyPlayer(player, [L_Interaction.AreaIntersectsWithOtherAssembly, assembly.displayName.get()])
  highlightArea(player, assembly.bbox, player.surface)
}

function highlightArea(player: LuaPlayer, area: BBox, surface: LuaSurface) {
  draw("rectangle", {
    surface,
    left_top: area.left_top,
    right_bottom: area.right_bottom,
    color: Colors.ErrorHighlight,
    filled: false,
    width: 5,
    players: [player],
    time_to_live: 60 * 2,
  })
}
function createAreaPreview(player: LuaPlayer, surface: LuaSurface, area: BBox): RectangleRender {
  const render = draw("rectangle", {
    surface,
    left_top: area.left_top,
    right_bottom: area.right_bottom,
    color: Colors.AreaPreview,
    filled: true,
    players: [player],
    draw_on_ground: true,
  })
  return render
}

function notifyPlayer(player: LuaPlayer, message: LocalisedString) {
  player.create_local_flying_text({
    text: message,
    create_at_cursor: true,
  })
}

function tryBeginCreateAssembly(event: OnPlayerSelectedAreaEvent) {
  const player = game.get_player(event.player_index)!
  const intersecting = findIntersectingAssembly(event.area)
  if (intersecting) return notifyIntersectingAssembly(player, intersecting)

  const area = BBox.roundChunk(event.area)
  const view = createAreaPreview(player, player.surface, area)

  render(<NewAssembly area={area} view={view} />, player.gui.screen)
}

Events.on_player_selected_area((e) => {
  if (e.item === Prototypes.AssemblyAddTool) tryBeginCreateAssembly(e)
})

interface NewGuiData {
  view: RectangleRender
  area: BBox
}

const guiWidth = 300
@RegisterClass("gui:NewAssemblyGui")
class NewAssembly extends Component<NewGuiData> {
  element!: LuaGuiElement
  area!: BBox
  name!: TextFieldGuiElement
  numStages!: TextFieldGuiElement
  deleteExisting!: CheckboxGuiElement
  override render(props: NewGuiData, tracker: Tracker): Spec {
    tracker.getSubscription().add(noSelfFuncOn(props.view.destroy))
    this.area = props.area
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
          <flow direction="horizontal" style="player_input_horizontal_flow">
            <label
              caption={[L_GuiNewAssembly.DeleteExistingEntities]}
              tooltip={[L_GuiNewAssembly.DeleteExistingEntitiesTooltip]}
            />

            <HorizontalPusher />
            <checkbox state={true} enabled={false} onCreate={(e) => (this.deleteExisting = e)} />
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
    const area = this.area
    const name = this.name.text.trim()
    const numStages = tonumber(this.numStages.text)
    // const deleteExisting = this.deleteExisting.state
    const deleteExisting = true
    if (!numStages || numStages <= 0) {
      notifyPlayer(player, [L_GuiNewAssembly.InvalidNumStages])
      return
    }
    destroy(this.element)

    tryCreateAssembly(player, name, area, floor(numStages), deleteExisting)
  }
}

function tryCreateAssembly(player: LuaPlayer, name: string, area: BBox, numStages: number, deleteExisting: boolean) {
  area = BBox.roundChunk(area)
  const existing = findIntersectingAssembly(area) // check again
  if (existing) return notifyIntersectingAssembly(player, existing)
  const assembly = userCreateAssembly(area, numStages, deleteExisting, name)

  openAssemblySettings(player, assembly)
}

/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { ChooseElemButtonGuiElement, EntityPrototypeFilter, LuaPlayer } from "factorio:runtime"
import { Prototypes } from "../constants"
import { Events, MutableProperty, RegisterClass } from "../lib"
import { Component, destroy, FactorioJsx, getComponentInstance, renderNamed } from "../lib/factoriojsx"
import { L_Gui } from "../locale"

type FilterProp = MutableProperty<ReadonlyLuaSet<string> | nil>

const EditBlueprintFilterGuiName = "bp100:EditBlueprintFilterGui"
export function editBlueprintFilters(player: LuaPlayer, filters: FilterProp): void {
  renderNamed(<EditBlueprintFilterGui filters={filters} />, player.gui.relative, EditBlueprintFilterGuiName)
  player.opened = defines.gui_type.controller
}
@RegisterClass("gui:BlueprintFilterEdit")
class EditBlueprintFilterGui extends Component<{
  filters: FilterProp
}> {
  filters!: FilterProp
  slots: ChooseElemButtonGuiElement[] = []
  render({ filters }: { filters: FilterProp }) {
    this.filters = filters
    const elemFilters: EntityPrototypeFilter[] = [
      { filter: "blueprintable" },
      { mode: "and", filter: "name", name: Prototypes.EntityMarker, invert: true },
      { mode: "and", filter: "name", name: Prototypes.UndoReference, invert: true },
    ]
    const currentValues = filters.get()
    const currentValuesAsArray: string[] = currentValues ? Object.keys(currentValues) : []
    return (
      <flow
        anchor={{
          gui: defines.relative_gui_type.controller_gui,
          position: defines.relative_gui_position.top,
        }}
        direction="horizontal"
        styleMod={{
          horizontal_align: "center",
        }}
      >
        <frame
          caption={[L_Gui.BlueprintFilters]}
          styleMod={{
            maximal_width: 10 * 40 + 25,
          }}
        >
          <frame style="inside_deep_frame">
            <table style="slot_table" column_count={10}>
              {Array.from({ length: 100 }, (_, i) => (
                <choose-elem-button
                  elem_type="entity"
                  elem_filters={elemFilters}
                  elem_value={currentValuesAsArray[i]}
                  onCreate={(e) => (this.slots[i] = e)}
                />
              ))}
            </table>
          </frame>
        </frame>
      </flow>
    )
  }
  onClose() {
    const newValue = new LuaSet<string>()
    for (const slot of this.slots) {
      if (slot.elem_value) {
        newValue.add(slot.elem_value)
      }
    }
    this.filters.set(newValue.isEmpty() ? nil : newValue)
  }
}

Events.on_gui_closed((event) => {
  if (event.gui_type != defines.gui_type.controller) return
  const player = game.get_player(event.player_index)!
  const element = player.gui.relative[EditBlueprintFilterGuiName]
  if (element) {
    const instance = getComponentInstance(element)
    if (instance && instance instanceof EditBlueprintFilterGui) {
      instance.onClose()
    }
    destroy(element)
  }
})

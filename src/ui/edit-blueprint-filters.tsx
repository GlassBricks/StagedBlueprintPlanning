// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { ChooseElemButtonGuiElement, EntityPrototypeFilter, LuaPlayer } from "factorio:runtime"
import { Prototypes } from "../constants"
import { Events, MutableProperty, RegisterClass } from "../lib"
import { Component, destroy, FactorioJsx, getComponentInstance, renderNamed } from "../lib/factoriojsx"
import { L_Gui } from "../locale"

type FilterProp = MutableProperty<ReadonlyLuaSet<string> | nil>

const EditBlueprintFilterGuiName = "bp100_EditBlueprintFilterGui"
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

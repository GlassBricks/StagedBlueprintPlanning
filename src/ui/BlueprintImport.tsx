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

import { PlayerIndex } from "factorio:runtime"
import { importBlueprintBookFromString } from "../blueprints/blueprint-import"
import { ibind, RegisterClass } from "../lib"
import { Component, Element, FactorioJsx } from "../lib/factoriojsx"
import { L_GuiBlueprintImport } from "../locale"

@RegisterClass("gui:BlueprintImportDialog")
export class BlueprintImportDialog extends Component<{ playerIndex: PlayerIndex }> {
  private element: any
  private textfield: any
  private confirmButton: any
  private playerIndex!: PlayerIndex
  
  render(props: { playerIndex: PlayerIndex }): Element {
    this.playerIndex = props.playerIndex
    
    return (
      <frame 
        direction="vertical" 
        auto_center 
        caption={[L_GuiBlueprintImport.ImportBlueprintBookDialogTitle]} 
        on_gui_closed={ibind(this.onCancel)}
        onCreate={(e) => { this.element = e; return e }}
        styleMod={{ minimal_width: 720, minimal_height: 350 }}
      >
        <label caption={[L_GuiBlueprintImport.ImportBlueprintBookDialogMessage]} />
        <scroll-pane 
          style="naked_scroll_pane"
          styleMod={{ width: 700, height: 250, padding: 4 }}
        >
          <text-box
            text=""
            style="textbox"
            word_wrap
            on_gui_text_changed={ibind(this.onTextChanged)}
            onCreate={(e) => { this.textfield = e; e.focus(); return e }}
            styleMod={{ width: 680, height: 230 }}
          />
        </scroll-pane>
        <flow 
          style="dialog_buttons_horizontal_flow"
          styleMod={{ top_margin: 4 }}
        >
          <button
            style="back_button"
            caption={["gui.cancel"]}
            on_gui_click={ibind(this.onCancel)}
          />
          <empty-widget
            style="draggable_space"
            styleMod={{ horizontally_stretchable: true }}
            onCreate={(e) => { (e as any).drag_target = (e as any).parent!.parent; return (e as any).parent!.parent }}
          />
          <button
            style="confirm_button"
            caption={["gui.confirm"]}
            enabled={false}
            on_gui_click={ibind(this.onConfirm)}
            onCreate={(e) => { this.confirmButton = e; return e }}
          />
        </flow>
      </frame>
    )
  }
  
  private onTextChanged(e: any) {
    const text = this.textfield.text
    this.confirmButton.enabled = text != nil && text != ""
  }
  
  private onConfirm() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    
    const blueprintString = this.textfield.text
    const result = importBlueprintBookFromString(blueprintString, player)
    
    if (result.success) {
      player.print(`BP Import: Successfully created project with ${result.stageCount} stages!`)
      this.destroy()
    } else {
      const errorKey = `bp100.gui.blueprint-import.import-${result.error}`
      player.create_local_flying_text({
        text: [errorKey],
        create_at_cursor: true,
      })
    }
  }
  
  private onCancel() {
    this.destroy()
  }
  
  destroy() {
    if (this.element && this.element.valid) {
      this.element.destroy()
    }
  }
}
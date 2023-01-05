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

import { Func, ibind, RegisterClass } from "../../references"
import { destroy, FactorioJsx, GuiEvent, renderOpened } from "../index"
import { Component, Element } from "../element"

export interface DialogueProps {
  title: LocalisedString
  message: LocalisedString[]

  backCaption?: LocalisedString
  onBack?: Func<(player: LuaPlayer) => void>

  confirmCaption?: LocalisedString
  onConfirm?: Func<(player: LuaPlayer) => void>

  redConfirm?: boolean
}
@RegisterClass("gui:Dialog")
export class Dialog extends Component<DialogueProps> {
  private element!: FrameGuiElementMembers
  private onBackFn?: Func<(player: LuaPlayer) => void>
  private onConfirmFn?: Func<(player: LuaPlayer) => void>
  private redConfirm?: boolean
  public override render(props: DialogueProps): Element {
    assert(props.backCaption || props.confirmCaption, "Dialog requires at least one button")

    this.onBackFn = props.onBack
    this.onConfirmFn = props.onConfirm
    this.redConfirm = props.redConfirm

    return (
      <frame
        auto_center
        caption={props.title}
        direction={"vertical"}
        onCreate={(e) => (this.element = e)}
        on_gui_closed={ibind(this.onClose)}
      >
        {props.message.map((line) => (
          <label caption={line} />
        ))}
        <flow style="dialog_buttons_horizontal_flow">
          {props.backCaption != nil && (
            <button style="back_button" caption={props.backCaption} on_gui_click={ibind(this.onBack)} />
          )}
          <empty-widget
            style="draggable_space"
            styleMod={{ horizontally_stretchable: true }}
            onCreate={(e) => (e.drag_target = e.parent!.parent as FrameGuiElement)}
          />
          {props.confirmCaption != nil && (
            <button
              style={props.redConfirm ? "red_confirm_button" : "confirm_button"}
              caption={props.confirmCaption}
              on_gui_click={ibind(this.onConfirm)}
            />
          )}
        </flow>
      </frame>
    )
  }

  private onBack(e: GuiEvent) {
    this.onBackFn?.invoke(game.players[e.player_index])
    destroy(this.element)
  }

  private onConfirm(e: GuiEvent) {
    this.onConfirmFn?.invoke(game.players[e.player_index])
    destroy(this.element)
  }
  private onClose(e: OnGuiClosedEvent) {
    if (this.redConfirm) {
      this.onBack(e)
    } else {
      this.onConfirm(e)
    }
  }
}

export function showDialog(player: LuaPlayer, props: DialogueProps): void {
  renderOpened(player, { type: Dialog, props })
}

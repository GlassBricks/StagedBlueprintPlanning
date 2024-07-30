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

import { LuaPlayer } from "factorio:runtime"
import { funcRef, RegisterClass } from "../lib"
import { Component, destroyOnClose, Element, FactorioJsx, renderNamed } from "../lib/factoriojsx"
import { SimpleTitleBar } from "../lib/factoriojsx/components"
import { L_GuiProjectSettings } from "../locale"

@RegisterClass("gui:ShowBlueprintString")
class ShowBlueprintString extends Component<{
  bookName: string
  blueprintString: string
}> {
  render(props: { bookName: string; blueprintString: string }): Element {
    return (
      <frame auto_center direction="vertical" on_gui_closed={funcRef(destroyOnClose)}>
        <SimpleTitleBar title={[L_GuiProjectSettings.BlueprintStringFor, props.bookName]} />
        <text-box
          word_wrap
          styleMod={{ width: 400, height: 250 }}
          text={props.blueprintString}
          onCreate={(e) => {
            e.select_all()
            e.scroll_to_top()
          }}
        />
      </frame>
    )
  }
}

const ShowBlueprintStringName = "bp100-show-blueprint-string"

export function showBlueprintString(player: LuaPlayer, bookName: string, blueprintString: string): void {
  player.opened = renderNamed(
    <ShowBlueprintString bookName={bookName} blueprintString={blueprintString} />,
    player.gui.screen,
    ShowBlueprintStringName,
  )
}

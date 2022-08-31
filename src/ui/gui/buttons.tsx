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

import { Sprites } from "../../constants"
import { MaybeState } from "../../lib"
import { ClickEventHandler, FactorioJsx, Spec } from "../../lib/factoriojsx"

export function ExternalLinkButton(props: {
  on_gui_click?: ClickEventHandler
  tooltip?: MaybeState<LocalisedString>
  enabled?: MaybeState<boolean>
}): Spec {
  return (
    <sprite-button
      style="frame_action_button"
      sprite={Sprites.ExternalLinkWhite}
      hovered_sprite={Sprites.ExternalLinkBlack}
      clicked_sprite={Sprites.ExternalLinkBlack}
      mouse_button_filter={["left"]}
      on_gui_click={props.on_gui_click}
      enabled={props.enabled}
      tooltip={props.tooltip}
    />
  )
}

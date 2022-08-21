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

import { Sprites } from "../../constants"
import { ClickEventHandler, FactorioJsx, Spec } from "../../lib/factoriojsx"
import { MaybeState } from "../../lib/observable"

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

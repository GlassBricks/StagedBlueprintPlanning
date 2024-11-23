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

import { OnPlayerSelectedAreaEvent } from "factorio:runtime"
import { PRecord } from "./_util"
import { ProtectedEvents } from "./ProtectedEvents"

/** @noSelf */
export interface SelectHandlers {
  onSelected?(event: OnPlayerSelectedAreaEvent): void
  onAltSelected?(event: OnPlayerSelectedAreaEvent): void
  onReverseSelected?(event: OnPlayerSelectedAreaEvent): void
  onAltReverseSelected?(event: OnPlayerSelectedAreaEvent): void
}
type SelectHandler = (event: OnPlayerSelectedAreaEvent) => void

const globalHandlers = {
  on_player_selected_area: new LuaMap<string, SelectHandler>(),
  on_player_alt_selected_area: new LuaMap<string, SelectHandler>(),
  on_player_reverse_selected_area: new LuaMap<string, SelectHandler>(),
  on_player_alt_reverse_selected_area: new LuaMap<string, SelectHandler>(),
} satisfies PRecord<keyof typeof defines.events, LuaMap<string, SelectHandler>>

export function addSelectionToolHandlers(prototype: string, handlers: SelectHandlers): void {
  if (handlers.onSelected) globalHandlers.on_player_selected_area.set(prototype, handlers.onSelected)
  if (handlers.onAltSelected) globalHandlers.on_player_alt_selected_area.set(prototype, handlers.onAltSelected)
  if (handlers.onReverseSelected)
    globalHandlers.on_player_reverse_selected_area.set(prototype, handlers.onReverseSelected)
  if (handlers.onAltReverseSelected)
    globalHandlers.on_player_alt_reverse_selected_area.set(prototype, handlers.onAltReverseSelected)
}

for (const [eventName, handlers] of pairs(globalHandlers)) {
  ProtectedEvents[eventName]((event) => {
    const handler = handlers.get(event.item)
    handler?.(event as OnPlayerSelectedAreaEvent)
  })
}

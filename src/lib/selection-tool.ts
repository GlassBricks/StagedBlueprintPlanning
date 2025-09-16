// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { OnPlayerSelectedAreaEvent } from "factorio:runtime"
import { ProtectedEvents } from "./ProtectedEvents"
import { PRecord } from "./_util"

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

// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { EventId } from "factorio:runtime"
import { Mutable } from "./_util"
import {
  AnyHandler,
  EventDataOf,
  EventHandlers,
  Events,
  EventsRegistration,
  scriptEventIds,
  ScriptEvents,
  ShorthandRegister,
} from "./Events"
import { protectedAction } from "./protected-action"

function wrapFunction(func: AnyHandler): AnyHandler {
  return (e) => protectedAction(func, e)
}

const ProtectedEvents = {
  on<E extends EventId<any, any> | string>(event: E | E[], func: AnyHandler): void {
    Events.on(event, wrapFunction(func))
  },
  onAll(handlers: Mutable<EventHandlers>): void {
    for (const [key, func] of pairs(handlers)) {
      if (!(key == "on_load" || key == "on_init" || key == "on_configuration_changed")) {
        handlers[key] = wrapFunction(func)
      }
    }
    Events.onAll(handlers)
  },
  onInitOrLoad(f: () => void): void {
    Events.onInitOrLoad(f)
  },
  registerEarly<E extends EventId<any, any> | string>(event: E, f: (data: EventDataOf<E>) => void): void {
    Events.registerEarly(event, wrapFunction(f))
  },
} as EventsRegistration
setmetatable(ProtectedEvents, {
  __index(this: EventsRegistration, key: keyof any) {
    if (key in scriptEventIds) {
      return Events[key as keyof ScriptEvents]
    }
    if (key in defines.events) {
      return (handler: AnyHandler) => {
        Events[key as keyof ShorthandRegister](wrapFunction(handler))
      }
    }
  },
})

export { ProtectedEvents }

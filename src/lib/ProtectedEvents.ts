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

import { EventId } from "factorio:runtime"
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
import { Mutable } from "./util-types"

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

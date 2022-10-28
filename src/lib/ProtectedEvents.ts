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

import {
  AnyHandler,
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
      handlers[key] = wrapFunction(func)
    }
    Events.onAll(handlers)
  },
  onInitOrLoad(f: () => void): void {
    Events.onInitOrLoad(wrapFunction(f))
  },
} as EventsRegistration
setmetatable(ProtectedEvents, {
  __index(this: EventsRegistration, key: keyof any) {
    const id = scriptEventIds[key as keyof ScriptEvents] ?? defines.events[key as keyof typeof defines.events]
    if (id !== nil) {
      return (handler: AnyHandler) => {
        Events[key as keyof ShorthandRegister](wrapFunction(handler))
      }
    }
  },
})

export { ProtectedEvents }

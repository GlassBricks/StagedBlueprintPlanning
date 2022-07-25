/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

/** @noSelfInFile */

import { PRecord } from "./util-types"

export interface ScriptEvents {
  on_init: nil
  on_load: nil
  on_configuration_changed: ConfigurationChangedData
}

export type NamedEventTypes = {
  [E in keyof typeof defines.events]: typeof defines.events[E]["_eventData"]
} & ScriptEvents

export type EventHandlers = {
  [E in keyof NamedEventTypes]?: (data: NamedEventTypes[E]) => void
}

type EventDataOf<T extends EventId<any, any> | string> = T extends EventId<any, any>
  ? T["_eventData"]
  : T extends string
  ? CustomInputEvent
  : never

type ShorthandRegister = {
  -readonly [E in keyof NamedEventTypes]: (handler: (data: NamedEventTypes[E]) => void) => void
}

/** @noSelf */
export interface EventsObj extends ShorthandRegister {
  /**
   * Registers an event handler by id only. This can be called multiple times, and the event handlers will be called in
   * the order that they are registered.
   */
  on<E extends EventId<any, any>>(event: E | E[], f: (data: E["_eventData"]) => void): void
  on<E extends string>(event: E | E[], f: (data: CustomInputEvent) => void): void
  on<E extends EventId<any, any> | string>(event: E | E[], f: (data: EventDataOf<E>) => void): void
  /**
   * Registers multiple event handlers by name. Only game and script events can be registered here. For custom
   * events/input events, use `on` instead.
   *
   * @param handlers A table of event name -> event handler function
   */
  onAll(handlers: EventHandlers): void

  onInitOrLoad(f: () => void): void

  clearHandlers<E extends EventId<any, any> | string>(event: E): void

  raiseFakeEvent<E extends EventId<any, any>>(event: E, data: E["_eventData"]): void
  raiseFakeEvent<E extends string>(event: E, data: CustomInputEvent): void
  raiseFakeEvent<E extends EventId<any, any> | string>(event: E, data: EventDataOf<E>): void
  raiseFakeEventNamed<E extends keyof NamedEventTypes>(event: E, data: NamedEventTypes[E]): void
}

export const scriptEventIds: Record<keyof ScriptEvents, symbol> = {
  on_init: Symbol("on_init"),
  on_load: Symbol("on_load"),
  on_configuration_changed: Symbol("on_configuration_changed"),
}
type AnyHandler = (data?: any) => void

// number -- event id
// string -- custom input handler
// symbol -- script event
const registeredHandlers: PRecord<keyof any, AnyHandler[]> = {}

function registerInternal(id: keyof any, handler: AnyHandler) {
  let handlers = registeredHandlers[id]
  if (!handlers) {
    handlers = registeredHandlers[id] = []
  }
  handlers.push(handler)
  if (handlers.length > 2) return

  let func
  if (handlers.length === 1) {
    func = handler
  } else {
    const theHandlers = handlers
    func = (data: any) => {
      for (const i of $range(1, theHandlers.length)) {
        theHandlers[i - 1](data)
      }
    }
  }
  if (type(id) === "table") {
    script[(id as symbol).description as keyof ScriptEvents](func)
  } else {
    script.on_event(id as any, func)
  }
}

function raiseFakeEvent(id: keyof any, data: any) {
  const handlers = registeredHandlers[id]
  if (!handlers) return
  for (const handler of handlers) {
    handler(data)
  }
}

function clear(id: keyof any) {
  registeredHandlers[id] = nil
  if (type(id) === "table") {
    script[(id as symbol).description as keyof ScriptEvents](nil)
  } else {
    script.on_event(id as any, nil)
  }
}

const Events = {
  on<E extends EventId<any, any> | string>(event: E | E[], func: AnyHandler): void {
    if (!Array.isArray(event)) {
      registerInternal(event, func)
    } else {
      for (const e of event) {
        registerInternal(e, func)
      }
    }
  },
  onAll(handlers: EventHandlers): void {
    for (const [event, handler] of pairs(handlers)) {
      const id =
        scriptEventIds[event as keyof ScriptEvents] ??
        defines.events[event as keyof typeof defines.events] ??
        error(`"${event}" is not an event name. Use "register" to register a handler for a custom input event.`)
      registerInternal(id, handler)
    }
  },
  onInitOrLoad(f: () => void): void {
    registerInternal(scriptEventIds.on_init, f)
    registerInternal(scriptEventIds.on_load, f)
  },
  clearHandlers: clear,
  raiseFakeEvent(event: keyof any, data: any): void {
    raiseFakeEvent(event, data)
  },
  raiseFakeEventNamed(event: any, data: any): void {
    const id =
      scriptEventIds[event as keyof ScriptEvents] ??
      defines.events[event as keyof typeof defines.events] ??
      error(`"${event}" is not an event name.`)
    raiseFakeEvent(id, data)
  },
} as EventsObj

setmetatable(Events, {
  __index(this: EventsObj, key: keyof any) {
    const id = scriptEventIds[key as keyof ScriptEvents] ?? defines.events[key as keyof typeof defines.events]
    if (id !== nil) {
      return (handler: AnyHandler) => {
        registerInternal(id, handler)
      }
    }
  },
})

export { Events }

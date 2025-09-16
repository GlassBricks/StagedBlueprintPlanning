// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

/** @noSelfInFile */

import { ConfigurationChangedData, CustomInputEvent, EventData, EventId, MapPosition } from "factorio:runtime"
import { PRecord } from "./_util"

export interface ScriptEvents {
  on_init: nil
  on_load: nil
  on_configuration_changed: ConfigurationChangedData
}

export type NamedEventTypes = {
  [E in keyof typeof defines.events]: (typeof defines.events)[E]["_eventData"]
} & ScriptEvents

export type EventHandlers = {
  [E in keyof NamedEventTypes]?: (data: NamedEventTypes[E]) => void
}

export type EventDataOf<T extends EventId<any, any> | string> =
  T extends EventId<any, any> ? T["_eventData"] : T extends string ? CustomInputEvent : never

export type ShorthandRegister = {
  -readonly [E in keyof NamedEventTypes]: (handler: (data: NamedEventTypes[E]) => void) => void
}

/** @noSelf */
export interface EventsRegistration extends ShorthandRegister {
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

  registerEarly<E extends EventId<any, any> | string>(event: E, f: (data: EventDataOf<E>) => void): void
}

/** @noSelf */
export interface EventsObj extends EventsRegistration {
  clearHandlers<E extends EventId<any, any> | string>(event: E): void

  raiseFakeEvent<E extends EventId<any, any>>(event: E, data: Omit<E["_eventData"], keyof EventData>): void
  raiseFakeEvent(
    event: string,
    data: Omit<CustomInputEvent, keyof EventData | "input_name" | "cursor_display_location" | "cursor_position"> & {
      cursor_position?: MapPosition
    },
  ): void
  raiseFakeEvent<E extends EventId<any, any> | string>(
    event: E,
    data: Omit<EventDataOf<E>, keyof EventData | "quality">,
  ): void
  raiseFakeEventNamed<E extends keyof NamedEventTypes>(
    event: E,
    data: Omit<NamedEventTypes[E], keyof EventData | "quality">,
  ): void
}

export const scriptEventIds: Record<keyof ScriptEvents, symbol> = {
  on_init: Symbol("on_init"),
  on_load: Symbol("on_load"),
  on_configuration_changed: Symbol("on_configuration_changed"),
}
export type AnyHandler = (this: void, data?: any) => void

// number -- event id
// string -- custom input handler
// symbol -- script event
const registeredHandlers: PRecord<keyof any, AnyHandler[]> = {}

let canRegister = true
let ignoreRegister = false

export function _setCanRegister(value: boolean): void {
  canRegister = value
}

function registerInternal(id: keyof any, handler: AnyHandler, early?: boolean) {
  if (ignoreRegister) {
    log("Ignoring register call for " + tostring(id))
    return
  }
  if (!canRegister) error("Cannot register event handlers after on_init/on_load")
  let handlers = registeredHandlers[id]
  if (!handlers) {
    handlers = registeredHandlers[id] = []
  }
  if (early) handlers.unshift(handler)
  else handlers.push(handler)
  if (handlers.length > 2) return

  let func: AnyHandler
  if (handlers.length == 1) {
    func = handler
  } else {
    const theHandlers = handlers
    func = (data: any) => {
      for (const i of $range(1, theHandlers.length)) {
        theHandlers[i - 1](data)
      }
    }
  }
  if (type(id) == "table") {
    // script[(id as symbol).description as keyof ScriptEvents](func)
    const funcWrapper: AnyHandler = (data: any) => {
      func(data)
      canRegister = false
    }
    script[(id as symbol).description as keyof ScriptEvents](funcWrapper)
  } else {
    script.on_event(id as any, func)
  }
}

function raiseFakeEvent(id: keyof any, data: any) {
  ignoreRegister = true
  const handlers = registeredHandlers[id]
  if (!handlers) return
  if (data) {
    Object.assign(data, {
      tick: game.tick,
      name: typeof id != "object" ? id : nil,
    })
    if (typeof id == "string") {
      data.input_name = id
      data.cursor_position ??= { x: 0, y: 0 }
      data.quality ??= "normal"
    }
  }
  for (const handler of handlers) {
    handler(data)
  }
  ignoreRegister = false
}

function clear(id: keyof any) {
  registeredHandlers[id] = nil
  if (type(id) == "table") {
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
  registerEarly(e, f) {
    registerInternal(e, f, true)
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
    if (id != nil) {
      return (handler: AnyHandler) => {
        registerInternal(id, handler)
      }
    }
  },
})

export { Events }

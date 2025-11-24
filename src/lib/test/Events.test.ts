// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { Events, _setCanRegister } from "../Events"

const eventId = defines.events.script_raised_teleported
after_each(() => {
  Events.clearHandlers(eventId)
})
before_each(() => {
  Events.clearHandlers(eventId)
  _setCanRegister(true)
})
after_each(() => {
  _setCanRegister(false)
})

test("can register event handler directly", () => {
  const func = () => {}
  Events.on(eventId, func)

  expect(script.get_event_handler(eventId)).toBe(func)
})

test("can register multiple event handlers", () => {
  const actions: number[] = []
  Events.on(eventId, () => {
    actions.push(1)
  })
  Events.on(eventId, () => {
    actions.push(2)
  })
  Events.on(eventId, () => {
    actions.push(3)
  })
  Events.raiseFakeEvent(eventId, {} as any)
  expect(actions).toEqual([1, 2, 3])
})

test("Shorthand register", () => {
  const func = () => {}
  Events.script_raised_teleported(func)
  expect(script.get_event_handler(eventId)).toBe(func)
})

test("Object register", () => {
  const func = () => {}
  Events.onAll({
    script_raised_teleported: func,
  })
  expect(script.get_event_handler(eventId)).toBe(func)
})

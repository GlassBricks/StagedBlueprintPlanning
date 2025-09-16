// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

/** @noSelfInFile */
import expect from "tstl-expect"
import { _setCanRegister, Events } from "../Events"

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

test("Can register directly", () => {
  const func = () => {}
  Events.on(eventId, func)

  expect(script.get_event_handler(eventId)).toBe(func)
})

test("Can register multiple", () => {
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

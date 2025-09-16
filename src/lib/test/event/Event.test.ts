// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { mock } from "tstl-expect"
import { SimpleEvent, Subscription } from "../../event"

let event: SimpleEvent<string>
before_each(() => {
  event = new SimpleEvent<string>()
})
it("can be constructed", () => {
  expect(event).toBeAny()
})

describe("subscribe", () => {
  it("can be subscribed to", () => {
    const fn = mock.fn()
    event._subscribeIndependently({ invoke: fn })
    expect(fn).not.toHaveBeenCalled()
  })
  it("calls the subscriber with the value", () => {
    const fn = mock.fn()
    event._subscribeIndependently({ invoke: fn })
    event.raise("hello")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("hello")
  })

  it("can fire events multiple times", () => {
    const fn = mock.fn()
    event._subscribeIndependently({ invoke: fn })
    event.raise("1")
    event.raise("2")
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith("1")
    expect(fn).toHaveBeenCalledWith("2")
  })

  it("broadcasts to multiple subscribers", () => {
    const fn = mock.fn()
    const fn2 = mock.fn()
    event._subscribeIndependently({ invoke: fn })
    event._subscribeIndependently({ invoke: fn2 })
    event.raise("hello")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn2).toHaveBeenCalledTimes(1)
  })

  it("allows the same observer to be subscribed multiple times", () => {
    const fn = mock.fn()
    const observer = { invoke: fn }
    event._subscribeIndependently(observer)
    event._subscribeIndependently(observer)
    event.raise("1")
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe("unsubscribe", () => {
  it("returns subscription object", () => {
    const fn = mock.fn()
    const subscription = event._subscribeIndependently({ invoke: fn })
    expect(subscription).toBeAny()
  })
  it("can be unsubscribed", () => {
    const fn = mock.fn()
    const subscription = event._subscribeIndependently({ invoke: fn })
    event.raise("before")
    subscription.close()
    event.raise("after")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("before")
    expect(fn).not.toHaveBeenCalledWith("after")
  })

  it("can be unsubscribed via context", () => {
    const context = new Subscription()
    const fn = mock.fn()
    event.subscribe(context, { invoke: fn })
    event.raise("before")
    context.close()
    event.raise("after")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("before")
    expect(fn).not.toHaveBeenCalledWith("after")
  })
})

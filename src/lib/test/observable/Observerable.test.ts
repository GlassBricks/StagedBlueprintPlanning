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

import { Event, Subscription } from "../../observable"
import expect, { mock } from "tstl-expect"

let event: Event<string>
before_each(() => {
  event = new Event<string>()
})
it("can be constructed", () => {
  expect(event).to.be.any()
})

describe("subscribe", () => {
  it("can be subscribed to", () => {
    const fn = mock.fn()
    event.subscribeIndependently({ invoke: fn })
    expect(fn).not.called()
  })
  it("calls the subscriber with the value", () => {
    const fn = mock.fn()
    event.subscribeIndependently({ invoke: fn })
    event.raise("hello")
    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, "hello")
  })

  it("can fire events multiple times", () => {
    const fn = mock.fn()
    event.subscribeIndependently({ invoke: fn })
    event.raise("1")
    event.raise("2")
    expect(fn).calledTimes(2)
    expect(fn).calledWith(expect._, "1")
    expect(fn).calledWith(expect._, "2")
  })

  it("broadcasts to multiple subscribers", () => {
    const fn = mock.fn()
    const fn2 = mock.fn()
    event.subscribeIndependently({ invoke: fn })
    event.subscribeIndependently({ invoke: fn2 })
    event.raise("hello")
    expect(fn).calledTimes(1)
    expect(fn2).calledTimes(1)
  })

  it("allows the same observer to be subscribed multiple times", () => {
    const fn = mock.fn()
    const observer = { invoke: fn }
    event.subscribeIndependently(observer)
    event.subscribeIndependently(observer)
    event.raise("1")
    expect(fn).calledTimes(2)
  })
})

describe("unsubscribe", () => {
  it("returns subscription object", () => {
    const fn = mock.fn()
    const subscription = event.subscribeIndependently({ invoke: fn })
    expect(subscription).to.be.any()
  })
  it("can be unsubscribed", () => {
    const fn = mock.fn()
    const subscription = event.subscribeIndependently({ invoke: fn })
    event.raise("before")
    subscription.close()
    event.raise("after")
    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, "before")
    expect(fn).not.calledWith(expect._, "after")
  })

  it("can be unsubscribed via context", () => {
    const context = new Subscription()
    const fn = mock.fn()
    event.subscribe(context, { invoke: fn })
    event.raise("before")
    context.close()
    event.raise("after")
    expect(fn).calledTimes(1)
    expect(fn).calledWith(expect._, "before")
    expect(fn).not.calledWith(expect._, "after")
  })
})

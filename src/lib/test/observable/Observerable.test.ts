/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Event, Subscription } from "../../observable"

let event: Event<string>
before_each(() => {
  event = new Event<string>()
})
it("can be constructed", () => {
  assert.not_nil(event)
})

describe("subscribe", () => {
  it("can be subscribed to", () => {
    const fn = spy()
    event.subscribeIndependently({ invoke: fn })
    assert.spy(fn).not_called()
  })
  it("calls the subscriber with the value", () => {
    const fn = spy()
    event.subscribeIndependently({ invoke: fn })
    event.raise("hello")
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, "hello")
  })

  it("can fire events multiple times", () => {
    const fn = spy()
    event.subscribeIndependently({ invoke: fn })
    event.raise("1")
    event.raise("2")
    assert.spy(fn).called(2)
    assert.spy(fn).called_with(match._, "1")
    assert.spy(fn).called_with(match._, "2")
  })

  it("broadcasts to multiple subscribers", () => {
    const fn = spy()
    const fn2 = spy()
    event.subscribeIndependently({ invoke: fn })
    event.subscribeIndependently({ invoke: fn2 })
    event.raise("hello")
    assert.spy(fn).called(1)
    assert.spy(fn2).called(1)
  })

  it("allows the same observer to be subscribed multiple times", () => {
    const fn = spy()
    const observer = { invoke: fn }
    event.subscribeIndependently(observer)
    event.subscribeIndependently(observer)
    event.raise("1")
    assert.spy(fn).called(2)
  })
})

describe("unsubscribe", () => {
  it("returns subscription object", () => {
    const fn = spy()
    const subscription = event.subscribeIndependently({ invoke: fn })
    assert.not_nil(subscription)
  })
  it("can be unsubscribed", () => {
    const fn = spy()
    const subscription = event.subscribeIndependently({ invoke: fn })
    event.raise("before")
    subscription.close()
    event.raise("after")
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, "before")
    assert.spy(fn).not_called_with(match._, "after")
  })

  it("can be unsubscribed via context", () => {
    const context = new Subscription()
    const fn = spy()
    event.subscribe(context, { invoke: fn })
    event.raise("before")
    context.close()
    event.raise("after")
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, "before")
    assert.spy(fn).not_called_with(match._, "after")
  })
})

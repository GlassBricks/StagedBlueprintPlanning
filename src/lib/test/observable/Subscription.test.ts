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

import { Subscription, UnsubscriptionError } from "../../observable"
import expect, { AnyContextualFun, mock, MockWithContext } from "tstl-expect"

let a: Subscription
let b: Subscription

let sp: MockWithContext<AnyContextualFun>

before_each(() => {
  a = new Subscription()
  b = new Subscription()
  sp = mock.fn()
})

test("isClosed", () => {
  expect(a.isClosed()).to.be(false)
  a.close()
  expect(a.isClosed()).to.be(true)
})

test("calls added subscriptions when closed", () => {
  a.add({ close: sp })
  expect(sp).not.called()
  a.close()
  expect(sp).called()
})

test("calls subscription immediately if already closed", () => {
  a.close()
  a.add({ close: sp })
  expect(sp).called()
})

test("calls func subscriptions when closed", () => {
  a.add({ invoke: sp })
  expect(sp).not.called()
  a.close()
  expect(sp).called()
})

test("calls func subscriptions immediately if already closed", () => {
  a.close()
  a.add({ invoke: sp })
  expect(sp).called()
})

test("sets fields to nil when closed", () => {
  a.add({ close: sp })
  a.close()
  expect(a._children).to.be.nil()
  expect(a._parents).to.be.nil()
})

describe("child SubscriptionContext", () => {
  test("can add child", () => {
    a.add(b)
    expect(b._parents?.has(a)).to.be(true)
    expect(a._children?.has(b)).to.be(true)
  })

  test("cannot add self", () => {
    a.add(a)
    expect(a._parents?.has(a)).to.be(false)
    expect(a._children?.has(a)).to.be(false)
  })

  test("cannot add closed child", () => {
    b.close()
    a.add(b)
    expect(a._children?.has(b)).to.be(false)
  })

  test("calls close on child when closed", () => {
    const sp = mock.on(b, "close")
    a.add(b)
    expect(sp).not.called()
    a.close()
    expect(sp).called()
  })

  test("calls grandchildren subscriptions when closed", () => {
    b.add({ close: sp })
    a.add(b)
    expect(sp).not.called()
    a.close()
    expect(sp).called()
  })

  test("removes self from parent when closed", () => {
    a.add(b)
    b.close()
    expect(a._children?.has(b)).to.be(false)
  })
})

describe("errors", () => {
  function checkErr(err: unknown, expected: string[]) {
    expect(err instanceof UnsubscriptionError).to.be(true)
    const errors = (err as UnsubscriptionError).errors
    expect(errors.length).to.be(expected.length)
    for (let i = 0; i < expected.length; i++) {
      // assert.string(errors[i])
      expect(errors[i]).to.be.a("string")
      expect(errors[i]).to.include(expected[i])
    }
  }
  test("rethrows errors", () => {
    a.add({ close: () => error("err1") })
    const err = expect(() => a.close()).to.error()
    checkErr(err, ["err1"])
  })

  test("closes all subscriptions even if has errors", () => {
    a.add({ close: () => error("err1") })
    a.add({ close: sp })
    const err = expect(() => a.close()).to.error()
    checkErr(err, ["err1"])
  })

  test("when multiple errors, collects into UnsubscriptionError", () => {
    a.add({ close: () => error("err1") })
    a.add({ close: () => error("err2") })
    a.add({ close: () => error("err3") })
    const err = expect(() => a.close()).to.error()
    expect(err).to.be.a(UnsubscriptionError)
    checkErr(err, ["err1", "err2", "err3"])
  })

  test("when errors from child context, collects into UnsubscriptionError", () => {
    a.add({ close: () => error("err1") })
    b.add({ close: () => error("err2") })
    b.add({ close: () => error("err3") })
    a.add(b)
    const err = expect(() => a.close()).to.error()
    expect(err).to.be.a(UnsubscriptionError)
    checkErr(err, ["err1", "err2", "err3"])
  })
})

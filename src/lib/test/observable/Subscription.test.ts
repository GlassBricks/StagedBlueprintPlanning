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

import { Subscription, UnsubscriptionError } from "../../observable"

let a: Subscription
let b: Subscription

let sp: spy.Spy<() => void>

before_each(() => {
  a = new Subscription()
  b = new Subscription()
  sp = spy()
})

test("isClosed", () => {
  assert.false(a.isClosed())
  a.close()
  assert.true(a.isClosed())
})

test("calls added subscriptions when closed", () => {
  a.add({ close: sp })
  assert.spy(sp).not_called()
  a.close()
  assert.spy(sp).called()
})

test("calls subscription immediately if already closed", () => {
  a.close()
  a.add({ close: sp })
  assert.spy(sp).called()
})

test("calls func subscriptions when closed", () => {
  a.add({ invoke: sp })
  assert.spy(sp).not_called()
  a.close()
  assert.spy(sp).called()
})

test("calls func subscriptions immediately if already closed", () => {
  a.close()
  a.add({ invoke: sp })
  assert.spy(sp).called()
})

test("sets fields to nil when closed", () => {
  a.add({ close: sp })
  a.close()
  assert.nil(a._children)
  assert.nil(a._parents)
})

describe("child SubscriptionContext", () => {
  test("can add child", () => {
    a.add(b)
    assert.true(b._parents?.has(a))
    assert.true(a._children?.has(b))
  })

  test("cannot add self", () => {
    a.add(a)
    assert.false(a._parents?.has(a))
    assert.false(a._children?.has(a))
  })

  test("cannot add closed child", () => {
    b.close()
    a.add(b)
    assert.false(a._children?.has(b))
  })

  test("calls close on child when closed", () => {
    const sp = spy.on(b, "close")
    a.add(b)
    assert.spy(sp).not_called()
    a.close()
    assert.spy(sp).called()
  })

  test("calls grandchildren subscriptions when closed", () => {
    b.add({ close: sp })
    a.add(b)
    assert.spy(sp).not_called()
    a.close()
    assert.spy(sp).called()
  })

  test("removes self from parent when closed", () => {
    a.add(b)
    b.close()
    assert.false(a._children?.has(b))
  })
})

describe("errors", () => {
  function checkErr(err: unknown, expected: string[]) {
    assert.true(err instanceof UnsubscriptionError)
    const errors = (err as UnsubscriptionError).errors
    assert.equal(expected.length, errors.length)
    for (let i = 0; i < expected.length; i++) {
      assert.string(errors[i])
      assert.true((assert.string(errors[i]) as string).includes(expected[i]))
    }
  }
  test("rethrows errors", () => {
    a.add({ close: () => error("err1") })
    const err = assert.error(() => a.close())
    checkErr(err, ["err1"])
  })

  test("closes all subscriptions even if has errors", () => {
    a.add({ close: () => error("err1") })
    a.add({ close: sp })
    const err = assert.error(() => a.close())
    checkErr(err, ["err1"])
  })

  test("when multiple errors, collects into UnsubscriptionError", () => {
    a.add({ close: () => error("err1") })
    a.add({ close: () => error("err2") })
    a.add({ close: () => error("err3") })
    const err = assert.error(() => a.close())
    assert.true(err instanceof UnsubscriptionError)
    checkErr(err, ["err1", "err2", "err3"])
  })

  test("when errors from child context, collects into UnsubscriptionError", () => {
    a.add({ close: () => error("err1") })
    b.add({ close: () => error("err2") })
    b.add({ close: () => error("err3") })
    a.add(b)
    const err = assert.error(() => a.close())
    assert.true(err instanceof UnsubscriptionError)
    checkErr(err, ["err1", "err2", "err3"])
  })
})

// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { AnyContextualFun, mock, MockWithContext } from "tstl-expect"
import { Subscription, UnsubscriptionError } from "../../event"

let a: Subscription
let b: Subscription

let sp: MockWithContext<AnyContextualFun>

before_each(() => {
  a = new Subscription()
  b = new Subscription()
  sp = mock.fn()
})

test("isClosed", () => {
  expect(a.isClosed()).toBe(false)
  a.close()
  expect(a.isClosed()).toBe(true)
})

test("calls added subscriptions when closed", () => {
  a.add({ close: sp })
  expect(sp).not.toHaveBeenCalled()
  a.close()
  expect(sp).toHaveBeenCalled()
})

test("calls subscription immediately if already closed", () => {
  a.close()
  a.add({ close: sp })
  expect(sp).toHaveBeenCalled()
})

test("calls func subscriptions when closed", () => {
  a.add({ invoke: sp })
  expect(sp).not.toHaveBeenCalled()
  a.close()
  expect(sp).toHaveBeenCalled()
})

test("calls func subscriptions immediately if already closed", () => {
  a.close()
  a.add({ invoke: sp })
  expect(sp).toHaveBeenCalled()
})

test("sets fields to nil when closed", () => {
  a.add({ close: sp })
  a.close()
  expect(a._children).toBeNil()
  expect(a._parents).toBeNil()
})

describe("child SubscriptionContext", () => {
  test("can add child", () => {
    a.add(b)
    expect(b._parents?.has(a)).toBe(true)
    expect(a._children?.has(b)).toBe(true)
  })

  test("cannot add self", () => {
    a.add(a)
    expect(a._parents?.has(a)).toBe(false)
    expect(a._children?.has(a)).toBe(false)
  })

  test("cannot add closed child", () => {
    b.close()
    a.add(b)
    expect(a._children?.has(b)).toBe(false)
  })

  test("calls close on child when closed", () => {
    const sp = mock.on(b, "close")
    a.add(b)
    expect(sp).not.toHaveBeenCalled()
    a.close()
    expect(sp).toHaveBeenCalled()
  })

  test("calls grandchildren subscriptions when closed", () => {
    b.add({ close: sp })
    a.add(b)
    expect(sp).not.toHaveBeenCalled()
    a.close()
    expect(sp).toHaveBeenCalled()
  })

  test("removes self from parent when closed", () => {
    a.add(b)
    b.close()
    expect(a._children?.has(b)).toBe(false)
  })
})

describe("errors", () => {
  function checkErr(err: unknown, expected: string[]) {
    expect(err).toBeA(UnsubscriptionError)
    const errors = (err as UnsubscriptionError).errors
    expect(errors.length).toBe(expected.length)
    for (let i = 0; i < expected.length; i++) {
      // assert.string(errors[i])
      expect(errors[i]).toBeA("string")
      expect(errors[i]).toInclude(expected[i])
    }
  }
  test("rethrows errors", () => {
    a.add({ close: () => error("err1") })
    const err = expect(() => a.close())
      .toError()
      .getValue()
    checkErr(err, ["err1"])
  })

  test("closes all subscriptions even if has errors", () => {
    a.add({ close: () => error("err1") })
    a.add({ close: sp })
    const err = expect(() => a.close())
      .toError()
      .getValue()
    checkErr(err, ["err1"])
  })

  test("when multiple errors, collects into UnsubscriptionError", () => {
    a.add({ close: () => error("err1") })
    a.add({ close: () => error("err2") })
    a.add({ close: () => error("err3") })
    const err = expect(() => a.close())
      .toError()
      .getValue()
    checkErr(err, ["err1", "err2", "err3"])
  })

  test("when errors from child context, collects into UnsubscriptionError", () => {
    a.add({ close: () => error("err1") })
    b.add({ close: () => error("err2") })
    b.add({ close: () => error("err3") })
    a.add(b)
    const err = expect(() => a.close())
      .toError()
      .getValue()
    checkErr(err, ["err1", "err2", "err3"])
  })
})

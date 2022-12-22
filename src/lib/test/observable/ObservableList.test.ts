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

import { MutableObservableList, observableList, ObservableListChange } from "../../observable"
import expect, { mock } from "tstl-expect"

let list: MutableObservableList<string>
before_each(() => {
  list = observableList()
})

it("can be constructed", () => {
  expect(0).to.be(list.length())
})

it("keeps track of length", () => {
  list.push("a")
  expect(1).to.be(list.length())
  list.push("b")
  expect(2).to.be(list.length())
  list.pop()
  expect(1).to.be(list.length())
})

it("allows to inspect value", () => {
  list.push("a")
  list.push("b")
  expect(list.value()).to.equal(["a", "b"])
})

test("notifies subscribers of pushed items", () => {
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.push("a")
  expect(list.value()).to.equal(["a"])
  const change: ObservableListChange<string> = {
    list,
    type: "add",
    index: 0,
    value: "a",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("notifies subscribers of inserted items", () => {
  list.push("a")
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.insert(0, "b")
  expect(list.value()).to.equal(["b", "a"])
  const change: ObservableListChange<string> = {
    list,
    type: "add",
    index: 0,
    value: "b",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("notifies subscribers of popped items", () => {
  list.push("a")
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.pop()
  expect(list.value()).to.equal([])
  const change: ObservableListChange<string> = {
    list,
    type: "remove",
    index: 0,
    value: "a",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("notifies subscribers of removed items", () => {
  list.push("a")
  list.push("b")
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.remove(0)
  expect(list.value()).to.equal(["b"])
  const change: ObservableListChange<string> = {
    list,
    type: "remove",
    index: 0,
    value: "a",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("notifies subscribers of changed items", () => {
  list.push("a")
  list.push("b")
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.set(0, "c")
  expect(list.value()).to.equal(["c", "b"])
  const change: ObservableListChange<string> = {
    list,
    type: "set",
    index: 0,
    oldValue: "a",
    value: "c",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("does not notify subscribers of changed items when value is not changed", () => {
  list.push("a")
  list.push("b")
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.set(0, "a")
  expect(list.value()).to.equal(["a", "b"])
  expect(fn).not.called()
})

test("it notifies subscribers of swapped items", () => {
  list.push("a")
  list.push("b")
  const fn = mock.fn()
  list.subscribeIndependently({ invoke: fn })
  list.swap(0, 1)
  expect(list.value()).to.equal(["b", "a"])
  const change: ObservableListChange<string> = {
    list,
    type: "swap",
    indexA: 0,
    indexB: 1,
    newValueA: "b",
    newValueB: "a",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

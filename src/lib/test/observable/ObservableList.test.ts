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

import { MutableObservableList, observableList, ObservableListChange } from "../../observable"

let list: MutableObservableList<string>
before_each(() => {
  list = observableList()
})

it("can be constructed", () => {
  assert.equal(list.length(), 0)
})

it("keeps track of length", () => {
  list.push("a")
  assert.equal(list.length(), 1)
  list.push("b")
  assert.equal(list.length(), 2)
  list.pop()
  assert.equal(list.length(), 1)
})

it("allows to inspect value", () => {
  list.push("a")
  list.push("b")
  assert.same(["a", "b"], list.value())
})

test("notifies subscribers of pushed items", () => {
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.push("a")
  assert.same(["a"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "add",
    index: 0,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, change)
})

it("notifies subscribers of inserted items", () => {
  list.push("a")
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.insert(0, "b")
  assert.same(["b", "a"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "add",
    index: 0,
    value: "b",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, change)
})

it("notifies subscribers of popped items", () => {
  list.push("a")
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.pop()
  assert.same([], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "remove",
    index: 0,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, change)
})

it("notifies subscribers of removed items", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.remove(0)
  assert.same(["b"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "remove",
    index: 0,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, change)
})

it("notifies subscribers of changed items", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.set(0, "c")
  assert.same(["c", "b"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "set",
    index: 0,
    oldValue: "a",
    value: "c",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, change)
})

it("does not notify subscribers of changed items when value is not changed", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.set(0, "a")
  assert.same(["a", "b"], list.value())
  assert.spy(fn).not_called()
})

test("it notifies subscribers of swapped items", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently({ invoke: fn })
  list.swap(0, 1)
  assert.same(["b", "a"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "swap",
    indexA: 0,
    indexB: 1,
    newValueA: "b",
    newValueB: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, change)
})

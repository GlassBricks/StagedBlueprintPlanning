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

import { MutableObservableSet, observableSet, ObservableSetChange } from "../../observable"

let set: MutableObservableSet<string>
before_each(() => {
  set = observableSet<string>()
})

it("can be constructed", () => {
  assert.equal(set.size(), 0)
})

it("keeps track of size", () => {
  set.add("a")
  assert.equal(set.size(), 1)
  set.add("b")
  assert.equal(set.size(), 2)
  set.delete("a")
  assert.equal(set.size(), 1)
})

it("keeps track of added items", () => {
  set.add("a")
  assert.true(set.has("a"))
  set.add("b")
  assert.true(set.has("b"))
  set.delete("a")
  assert.false(set.has("a"))
})

it("allows to inspect value", () => {
  set.add("a")
  set.add("b")
  assert.same(newLuaSet("a", "b"), set.value())
})

it("can be iterated", () => {
  set.add("a")
  set.add("b")
  const values: string[] = []
  for (const value of set) {
    values.push(value)
  }
  assert.same(["a", "b"], values)
})

it("notifies subscribers of added items", () => {
  const fn = spy()
  set.subscribeIndependently({ invoke: fn })
  set.add("a")
  const change: ObservableSetChange<string> = {
    set,
    value: "a",
    added: true,
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, match._, change)
})

it("does not notify subscribers of already present items", () => {
  set.add("a")
  const fn = spy()
  set.subscribeIndependently({ invoke: fn })
  set.add("a")
  assert.spy(fn).not_called()
})

it("notifies subscribers of deleted items", () => {
  set.add("a")
  const fn = spy()
  set.subscribeIndependently({ invoke: fn })
  set.delete("a")
  const change: ObservableSetChange<string> = {
    set,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, match._, change)
})

it("does not notify subscribers of deleting not present items", () => {
  const fn = spy()
  set.subscribeIndependently({ invoke: fn })
  set.delete("a")
  assert.spy(fn).not_called()
})

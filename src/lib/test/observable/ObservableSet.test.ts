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

import { MutableObservableSet, observableSet, ObservableSetChange } from "../../observable"
import expect, { mock } from "tstl-expect"

let set: MutableObservableSet<string>
before_each(() => {
  set = observableSet<string>()
})

it("can be constructed", () => {
  expect(0).to.be(set.size())
})

it("keeps track of size", () => {
  set.add("a")
  expect(1).to.be(set.size())
  set.add("b")
  expect(2).to.be(set.size())
  set.delete("a")
  expect(1).to.be(set.size())
})

it("keeps track of added items", () => {
  set.add("a")
  expect(set.has("a")).to.be(true)
  set.add("b")
  expect(set.has("b")).to.be(true)
  set.delete("a")
  expect(set.has("a")).to.be(false)
})

it("allows to inspect value", () => {
  set.add("a")
  set.add("b")
  expect(set.value()).to.equal(newLuaSet("a", "b"))
})

it("can be iterated", () => {
  set.add("a")
  set.add("b")
  const values: string[] = []
  for (const value of set) {
    values.push(value)
  }
  expect(values).to.equal(["a", "b"])
})

it("notifies subscribers of added items", () => {
  const fn = mock.fn()
  set.subscribeIndependently({ invoke: fn })
  set.add("a")
  const change: ObservableSetChange<string> = {
    set,
    value: "a",
    added: true,
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("does not notify subscribers of already present items", () => {
  set.add("a")
  const fn = mock.fn()
  set.subscribeIndependently({ invoke: fn })
  set.add("a")
  expect(fn).not.called()
})

it("notifies subscribers of deleted items", () => {
  set.add("a")
  const fn = mock.fn()
  set.subscribeIndependently({ invoke: fn })
  set.delete("a")
  const change: ObservableSetChange<string> = {
    set,
    value: "a",
  }
  expect(fn).calledTimes(1)
  expect(fn).calledWith(change)
})

it("does not notify subscribers of deleting not present items", () => {
  const fn = mock.fn()
  set.subscribeIndependently({ invoke: fn })
  set.delete("a")
  expect(fn).not.called()
})

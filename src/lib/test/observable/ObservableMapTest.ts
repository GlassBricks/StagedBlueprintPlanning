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

import { MutableObservableMap, observableMap, ObservableMapChange } from "../../observable"
import expect, { mock } from "tstl-expect"

describe("ObservableMap", () => {
  let map: MutableObservableMap<string, number>
  before_each(() => {
    map = observableMap<string, number>()
  })

  it("can be constructed", () => {
    expect(0).to.be(map.size())
  })

  it("keeps track of size", () => {
    map.set("a", 1)
    expect(1).to.be(map.size())
    map.set("b", 2)
    expect(2).to.be(map.size())
    map.delete("a")
    expect(1).to.be(map.size())
  })

  it("keeps track of added items", () => {
    map.set("a", 1)
    expect(map.has("a")).to.be(true)
    map.set("b", 2)
    expect(map.has("b")).to.be(true)
    map.delete("a")
    expect(map.has("a")).to.be(false)
  })

  it("allows to inspect value", () => {
    map.set("a", 1)
    map.set("b", 2)
    expect(map.value()).to.equal({
      a: 1,
      b: 2,
    })
  })

  it("can be iterated", () => {
    map.set("a", 1)
    map.set("b", 2)
    const values: Record<string, number> = {}
    for (const [key, value] of map) {
      values[key] = value
    }
    expect(values).to.equal({ a: 1, b: 2 })
  })

  it("notifies subscribers of added items", () => {
    const fn = mock.fn()
    map.subscribeIndependently({ invoke: fn })
    map.set("a", 1)
    const change: ObservableMapChange<string, number> = {
      map,
      key: "a",
      oldValue: nil,
      value: 1,
    }
    expect(fn).calledTimes(1)
    expect(fn).calledWith(change)
  })

  it("does not notify subscribers of unchanged items", () => {
    map.set("a", 1)
    const fn = mock.fn()
    map.subscribeIndependently({ invoke: fn })
    map.set("a", 1)
    expect(fn).not.called()
  })

  it("notifies subscribers of changed items", () => {
    map.set("a", 1)
    const fn = mock.fn()
    map.subscribeIndependently({ invoke: fn })
    map.set("a", 2)
    const change: ObservableMapChange<string, number> = {
      map,
      key: "a",
      oldValue: 1,
      value: 2,
    }
    expect(fn).calledTimes(1)
    expect(fn).calledWith(change)
  })

  it("notifies subscribers of deleted items", () => {
    map.set("a", 1)
    const fn = mock.fn()
    map.subscribeIndependently({ invoke: fn })
    map.delete("a")
    const change: ObservableMapChange<string, number> = {
      map,
      key: "a",
      oldValue: 1,
      value: nil,
    }
    expect(fn).calledTimes(1)
    expect(fn).calledWith(change)
  })

  it("does not notify subscribers of deleting not present items", () => {
    const fn = mock.fn()
    map.subscribeIndependently({ invoke: fn })
    map.delete("a")
    expect(fn).not.called()
  })
})

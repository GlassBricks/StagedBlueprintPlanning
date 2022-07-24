import { MutableObservableMap, observableMap, ObservableMapChange } from "./ObservableMap"

describe("ObservableMap", () => {
  let map: MutableObservableMap<string, number>
  before_each(() => {
    map = observableMap<string, number>()
  })

  it("can be constructed", () => {
    assert.equal(map.size(), 0)
  })

  it("keeps track of size", () => {
    map.set("a", 1)
    assert.equal(map.size(), 1)
    map.set("b", 2)
    assert.equal(map.size(), 2)
    map.delete("a")
    assert.equal(map.size(), 1)
  })

  it("keeps track of added items", () => {
    map.set("a", 1)
    assert.true(map.has("a"))
    map.set("b", 2)
    assert.true(map.has("b"))
    map.delete("a")
    assert.false(map.has("a"))
  })

  it("allows to inspect value", () => {
    map.set("a", 1)
    map.set("b", 2)
    assert.same(
      {
        a: 1,
        b: 2,
      },
      map.value(),
    )
  })

  it("can be iterated", () => {
    map.set("a", 1)
    map.set("b", 2)
    const values: Record<string, number> = {}
    for (const [key, value] of map) {
      values[key] = value
    }
    assert.same({ a: 1, b: 2 }, values)
  })

  it("notifies subscribers of added items", () => {
    const fn = spy()
    map.subscribeIndependently({ invoke: fn })
    map.set("a", 1)
    const change: ObservableMapChange<string, number> = {
      map,
      key: "a",
      oldValue: nil,
      value: 1,
    }
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, change)
  })

  it("does not notify subscribers of unchanged items", () => {
    map.set("a", 1)
    const fn = spy()
    map.subscribeIndependently({ invoke: fn })
    map.set("a", 1)
    assert.spy(fn).not_called()
  })

  it("notifies subscribers of changed items", () => {
    map.set("a", 1)
    const fn = spy()
    map.subscribeIndependently({ invoke: fn })
    map.set("a", 2)
    const change: ObservableMapChange<string, number> = {
      map,
      key: "a",
      oldValue: 1,
      value: 2,
    }
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, change)
  })

  it("notifies subscribers of deleted items", () => {
    map.set("a", 1)
    const fn = spy()
    map.subscribeIndependently({ invoke: fn })
    map.delete("a")
    const change: ObservableMapChange<string, number> = {
      map,
      key: "a",
      oldValue: 1,
      value: nil,
    }
    assert.spy(fn).called(1)
    assert.spy(fn).called_with(match._, change)
  })

  it("does not notify subscribers of deleting not present items", () => {
    const fn = spy()
    map.subscribeIndependently({ invoke: fn })
    map.delete("a")
    assert.spy(fn).not_called()
  })
})

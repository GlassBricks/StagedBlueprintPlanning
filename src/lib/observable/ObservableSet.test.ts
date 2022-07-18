import { MutableObservableSet, observableSet, ObservableSetChange } from "./ObservableSet"

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
  set.subscribeIndependently(fn)
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
  set.subscribeIndependently(fn)
  set.add("a")
  assert.spy(fn).not_called()
})

it("notifies subscribers of deleted items", () => {
  set.add("a")
  const fn = spy()
  set.subscribeIndependently(fn)
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
  set.subscribeIndependently(fn)
  set.delete("a")
  assert.spy(fn).not_called()
})

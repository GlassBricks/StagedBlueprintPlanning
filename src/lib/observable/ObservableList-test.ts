import { MutableObservableList, observableList, ObservableListChange } from "./ObservableList"

let list: MutableObservableList<string>
before_each(() => {
  list = observableList()
})

function spy() {
  return globalThis.spy<any>()
}

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
  list.subscribeIndependently(fn)
  list.push("a")
  assert.same(["a"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "add",
    index: 0,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, match._, change)
})

it("notifies subscribers of inserted items", () => {
  list.push("a")
  const fn = spy()
  list.subscribeIndependently(fn)
  list.insert(0, "b")
  assert.same(["b", "a"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "add",
    index: 0,
    value: "b",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, match._, change)
})

it("notifies subscribers of popped items", () => {
  list.push("a")
  const fn = spy()
  list.subscribeIndependently(fn)
  list.pop()
  assert.same([], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "remove",
    index: 0,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, match._, change)
})

it("notifies subscribers of removed items", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently(fn)
  list.remove(0)
  assert.same(["b"], list.value())
  const change: ObservableListChange<string> = {
    list,
    type: "remove",
    index: 0,
    value: "a",
  }
  assert.spy(fn).called(1)
  assert.spy(fn).called_with(match._, match._, change)
})

it("notifies subscribers of changed items", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently(fn)
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
  assert.spy(fn).called_with(match._, match._, change)
})

it("does not notify subscribers of changed items when value is not changed", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently(fn)
  list.set(0, "a")
  assert.same(["a", "b"], list.value())
  assert.spy(fn).not_called()
})

test("it notifies subscribers of swapped items", () => {
  list.push("a")
  list.push("b")
  const fn = spy()
  list.subscribeIndependently(fn)
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
  assert.spy(fn).called_with(match._, match._, change)
})

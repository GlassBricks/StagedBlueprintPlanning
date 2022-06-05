import { asFunc } from "../test-util/func"
import { DependencyNode, dependencyNode } from "./DependencyNode"

it("should start out invalid", () => {
  const d = dependencyNode()
  assert.false(d.isUpToDate.get())
})

it("should be valid after ensureUpToDate", () => {
  const d = dependencyNode()
  d.ensureUpToDate()
  assert.true(d.isUpToDate.get())
})

it("should be invalid after markNotUpToDate", () => {
  const d = dependencyNode()
  d.markNotUpToDate()
  assert.false(d.isUpToDate.get())
})

it("notifies observers during resetSelf", () => {
  const d = dependencyNode()
  const fn = spy()
  d.onChanged(asFunc(fn))
  d.resetSelf()
  assert.spy(fn).called_with(match.ref(d))
})

test("should call given fn on resetSelf", () => {
  const fn = spy()
  const d = dependencyNode(asFunc(fn))
  d.resetSelf()
  assert.spy(fn).called()
})

describe("dependency", () => {
  let before: DependencyNode
  let node: DependencyNode
  let makeValidCalls: string[]
  before_each(() => {
    makeValidCalls = []
    before = dependencyNode(asFunc(() => makeValidCalls.push("dep")))
    node = dependencyNode(asFunc(() => makeValidCalls.push("n")))
    makeValidCalls = []
  })

  test("should be not upToDate after addDependency", () => {
    node.ensureUpToDate()
    node.addDependency(before)
    assert.false(node.isUpToDate.get())
  })

  test("calls ensureUpToDate on dependency when resetSelf is called", () => {
    node.addDependency(before)
    node.resetSelf()
    assert.same(["dep", "n"], makeValidCalls)
  })

  it("should be not upToDate when a dependency is changed", () => {
    node.addDependency(before)
    node.ensureUpToDate()
    before.resetSelf()
    assert.false(node.isUpToDate.get())
  })

  it("should be not upToDate when a dependency is not up to date", () => {
    node.addDependency(before)
    node.ensureUpToDate()
    before.markNotUpToDate()
    assert.false(node.isUpToDate.get())
  })

  it("should notify observers when invalidated from dependency", () => {
    const fn = spy()
    node.addDependency(before)
    node.ensureUpToDate()
    node.onChanged(asFunc(fn))
    before.resetSelf()
    assert.spy(fn).called_with(match.ref(node))
  })

  it("invalidating dependent does update already valid dependencies", () => {
    node.addDependency(before)
    before.ensureUpToDate()
    makeValidCalls = []

    assert.true(before.isUpToDate.get())
    node.ensureUpToDate()
    assert.true(before.isUpToDate.get())
    assert.same(["n"], makeValidCalls)
  })

  it("should make valid all dependencies during resetSelf", () => {
    const after = dependencyNode(asFunc(() => makeValidCalls.push("after")))
    after.addDependency(node)
    node.addDependency(before)
    after.resetSelf()
    assert.true(node.isUpToDate.get())
    assert.true(after.isUpToDate.get())
    assert.same(["dep", "n", "after"], makeValidCalls)
  })
})

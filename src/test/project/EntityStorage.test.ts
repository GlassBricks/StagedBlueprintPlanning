import expect from "tstl-expect"
import { newProjectEntity, ProjectEntity } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { EntityStorage } from "../../project/EntityStorage"

/** @noSelf */
interface MockObj {
  object_name: string
  valid: boolean
  value: string
  destroyed: boolean
  destroy(): void
}

function mockObj(value: string, valid = true): MockObj {
  const obj: MockObj = {
    object_name: "MockObj",
    valid,
    value,
    destroyed: false,
    destroy: () => {
      obj.destroyed = true
    },
  }
  return obj
}

interface TestTypes extends Record<string, MockObj> {
  alpha: MockObj
  beta: MockObj
}

let storage: EntityStorage<TestTypes>
let entityA: ProjectEntity
let entityB: ProjectEntity

before_each(() => {
  storage = new EntityStorage()
  entityA = newProjectEntity({ name: "iron-chest" }, Pos(0, 0), 0, 1)
  entityB = newProjectEntity({ name: "iron-chest" }, Pos(1, 1), 0, 1)
})

describe("get()", () => {
  test("returns nil for missing entries", () => {
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityA, "beta", 1)).toBeNil()
  })

  test("returns nil and deletes invalid entries", () => {
    storage.set(entityA, "alpha", 1, mockObj("hello", false))
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    storage.set(entityA, "alpha", 1, mockObj("hello"))
    expect(storage.get(entityA, "alpha", 1)).not.toBeNil()
  })
})

describe("set() and get()", () => {
  test("round-trip stores and retrieves value", () => {
    const obj = mockObj("hello")
    storage.set(entityA, "alpha", 1, obj)
    expect(storage.get(entityA, "alpha", 1)).toBe(obj)
  })

  test("stores different types independently", () => {
    const alphaObj = mockObj("hello")
    const betaObj = mockObj("world")
    storage.set(entityA, "alpha", 1, alphaObj)
    storage.set(entityA, "beta", 1, betaObj)
    expect(storage.get(entityA, "alpha", 1)).toBe(alphaObj)
    expect(storage.get(entityA, "beta", 1)).toBe(betaObj)
  })

  test("stores different stages independently", () => {
    const first = mockObj("first")
    const second = mockObj("second")
    storage.set(entityA, "alpha", 1, first)
    storage.set(entityA, "alpha", 2, second)
    expect(storage.get(entityA, "alpha", 1)).toBe(first)
    expect(storage.get(entityA, "alpha", 2)).toBe(second)
  })

  test("set with nil deletes", () => {
    storage.set(entityA, "alpha", 1, mockObj("hello"))
    storage.set(entityA, "alpha", 1, nil)
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
  })

  test("destroys old value when overwriting with different value", () => {
    const old = mockObj("old")
    const replacement = mockObj("new")
    storage.set(entityA, "alpha", 1, old)
    storage.set(entityA, "alpha", 1, replacement)
    expect(old.destroyed).toBe(true)
    expect(replacement.destroyed).toBe(false)
    expect(storage.get(entityA, "alpha", 1)).toBe(replacement)
  })

  test("does not destroy when setting same value", () => {
    const obj = mockObj("same")
    storage.set(entityA, "alpha", 1, obj)
    storage.set(entityA, "alpha", 1, obj)
    expect(obj.destroyed).toBe(false)
  })

  test("does not destroy invalid old value when overwriting", () => {
    const old = mockObj("old", false)
    storage.set(entityA, "alpha", 1, old)
    storage.set(entityA, "alpha", 1, mockObj("new"))
    expect(old.destroyed).toBe(false)
  })
})

describe("delete()", () => {
  test("removes entry", () => {
    storage.set(entityA, "alpha", 1, mockObj("hello"))
    storage.delete(entityA, "alpha", 1)
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
  })

  test("does nothing for missing entry", () => {
    storage.delete(entityA, "alpha", 1)
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
  })

  test("destroys valid entry on delete", () => {
    const obj = mockObj("hello")
    storage.set(entityA, "alpha", 1, obj)
    storage.delete(entityA, "alpha", 1)
    expect(obj.destroyed).toBe(true)
  })

  test("does not destroy invalid entry on delete", () => {
    const obj = mockObj("hello", false)
    storage.set(entityA, "alpha", 1, obj)
    storage.delete(entityA, "alpha", 1)
    expect(obj.destroyed).toBe(false)
  })
})

describe("deleteAllOfType()", () => {
  test("removes all stages for one type, preserves other types", () => {
    storage.set(entityA, "alpha", 1, mockObj("a"))
    storage.set(entityA, "alpha", 2, mockObj("b"))
    const betaObj = mockObj("ten")
    storage.set(entityA, "beta", 1, betaObj)

    storage.deleteAllOfType(entityA, "alpha")

    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "beta", 1)).toBe(betaObj)
  })

  test("destroys all valid entries of given type", () => {
    const a = mockObj("a")
    const b = mockObj("b")
    const invalid = mockObj("invalid", false)
    storage.set(entityA, "alpha", 1, a)
    storage.set(entityA, "alpha", 2, b)
    storage.set(entityA, "alpha", 3, invalid)

    storage.deleteAllOfType(entityA, "alpha")

    expect(a.destroyed).toBe(true)
    expect(b.destroyed).toBe(true)
    expect(invalid.destroyed).toBe(false)
  })
})

describe("deleteAllForEntity()", () => {
  test("removes all types and stages", () => {
    storage.set(entityA, "alpha", 1, mockObj("a"))
    storage.set(entityA, "alpha", 2, mockObj("b"))
    storage.set(entityA, "beta", 1, mockObj("ten"))

    storage.deleteAllForEntity(entityA)

    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "beta", 1)).toBeNil()
  })

  test("destroys all valid entries across all types", () => {
    const a1 = mockObj("a1")
    const a2 = mockObj("a2")
    const b1 = mockObj("b1")
    const invalid = mockObj("invalid", false)
    storage.set(entityA, "alpha", 1, a1)
    storage.set(entityA, "alpha", 2, a2)
    storage.set(entityA, "beta", 1, b1)
    storage.set(entityA, "beta", 2, invalid)

    storage.deleteAllForEntity(entityA)

    expect(a1.destroyed).toBe(true)
    expect(a2.destroyed).toBe(true)
    expect(b1.destroyed).toBe(true)
    expect(invalid.destroyed).toBe(false)
  })
})

describe("iterateType()", () => {
  test("yields all stage-value pairs for a type", () => {
    const a = mockObj("a")
    const c = mockObj("c")
    storage.set(entityA, "alpha", 1, a)
    storage.set(entityA, "alpha", 3, c)

    const results = new LuaMap<number, MockObj>()
    for (const [stage, value] of storage.iterateType(entityA, "alpha")) {
      results.set(stage, value)
    }
    expect(results.get(1)).toBe(a)
    expect(results.get(3)).toBe(c)
  })

  test("yields nothing for missing type", () => {
    let count = 0
    for (const [,] of storage.iterateType(entityA, "alpha")) {
      count++
    }
    expect(count).toBe(0)
  })

  test("skips invalid entries and deletes them", () => {
    storage.set(entityA, "alpha", 1, mockObj("valid"))
    storage.set(entityA, "alpha", 2, mockObj("invalid", false))
    storage.set(entityA, "alpha", 3, mockObj("also-valid"))

    const results = new LuaMap<number, MockObj>()
    for (const [stage, value] of storage.iterateType(entityA, "alpha")) {
      results.set(stage, value)
    }
    expect(results.get(1)).not.toBeNil()
    expect(results.get(2)).toBeNil()
    expect(results.get(3)).not.toBeNil()
  })
})

describe("shiftStageKeysUp()", () => {
  test("shifts keys >= fromStage up by 1", () => {
    const a = mockObj("a")
    const b = mockObj("b")
    const c = mockObj("c")
    storage.set(entityA, "alpha", 1, a)
    storage.set(entityA, "alpha", 2, b)
    storage.set(entityA, "alpha", 3, c)

    storage.shiftStageKeysUp(entityA, 2)

    expect(storage.get(entityA, "alpha", 1)).toBe(a)
    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "alpha", 3)).toBe(b)
    expect(storage.get(entityA, "alpha", 4)).toBe(c)
  })

  test("shifts all types", () => {
    const alphaObj = mockObj("a")
    const betaObj = mockObj("forty-two")
    storage.set(entityA, "alpha", 2, alphaObj)
    storage.set(entityA, "beta", 2, betaObj)

    storage.shiftStageKeysUp(entityA, 2)

    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "alpha", 3)).toBe(alphaObj)
    expect(storage.get(entityA, "beta", 2)).toBeNil()
    expect(storage.get(entityA, "beta", 3)).toBe(betaObj)
  })
})

describe("shiftStageKeysDown()", () => {
  test("deletes at fromStage and shifts keys > fromStage down by 1", () => {
    const a = mockObj("a")
    const c = mockObj("c")
    storage.set(entityA, "alpha", 1, a)
    storage.set(entityA, "alpha", 2, mockObj("b"))
    storage.set(entityA, "alpha", 3, c)

    storage.shiftStageKeysDown(entityA, 2)

    expect(storage.get(entityA, "alpha", 1)).toBe(a)
    expect(storage.get(entityA, "alpha", 2)).toBe(c)
    expect(storage.get(entityA, "alpha", 3)).toBeNil()
  })

  test("shifts all types", () => {
    const alphaB = mockObj("b")
    const betaTwenty = mockObj("twenty")
    storage.set(entityA, "alpha", 2, mockObj("a"))
    storage.set(entityA, "alpha", 3, alphaB)
    storage.set(entityA, "beta", 2, mockObj("ten"))
    storage.set(entityA, "beta", 3, betaTwenty)

    storage.shiftStageKeysDown(entityA, 2)

    expect(storage.get(entityA, "alpha", 2)).toBe(alphaB)
    expect(storage.get(entityA, "alpha", 3)).toBeNil()
    expect(storage.get(entityA, "beta", 2)).toBe(betaTwenty)
    expect(storage.get(entityA, "beta", 3)).toBeNil()
  })

  test("destroys valid entry at fromStage", () => {
    const removed = mockObj("removed")
    const kept = mockObj("kept")
    storage.set(entityA, "alpha", 2, removed)
    storage.set(entityA, "alpha", 3, kept)

    storage.shiftStageKeysDown(entityA, 2)

    expect(removed.destroyed).toBe(true)
    expect(kept.destroyed).toBe(false)
  })

  test("does not destroy invalid entry at fromStage", () => {
    const invalid = mockObj("invalid", false)
    storage.set(entityA, "alpha", 2, invalid)

    storage.shiftStageKeysDown(entityA, 2)

    expect(invalid.destroyed).toBe(false)
  })
})

describe("multiple entities", () => {
  test("are independent", () => {
    const fromA = mockObj("fromA")
    const fromB = mockObj("fromB")
    storage.set(entityA, "alpha", 1, fromA)
    storage.set(entityB, "alpha", 1, fromB)

    expect(storage.get(entityA, "alpha", 1)).toBe(fromA)
    expect(storage.get(entityB, "alpha", 1)).toBe(fromB)

    storage.deleteAllForEntity(entityA)

    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityB, "alpha", 1)).toBe(fromB)
  })
})

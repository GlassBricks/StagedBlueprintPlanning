import expect from "tstl-expect"
import { newProjectEntity, ProjectEntity } from "../../entity/ProjectEntity"
import { Pos } from "../../lib/geometry"
import { EntityStorage } from "../../project/EntityStorage"

interface TestTypes extends Record<string, unknown> {
  alpha: string
  beta: number
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
})

describe("set() and get()", () => {
  test("round-trip stores and retrieves value", () => {
    storage.set(entityA, "alpha", 1, "hello")
    expect(storage.get(entityA, "alpha", 1)).toBe("hello")
  })

  test("stores different types independently", () => {
    storage.set(entityA, "alpha", 1, "hello")
    storage.set(entityA, "beta", 1, 42)
    expect(storage.get(entityA, "alpha", 1)).toBe("hello")
    expect(storage.get(entityA, "beta", 1)).toBe(42)
  })

  test("stores different stages independently", () => {
    storage.set(entityA, "alpha", 1, "first")
    storage.set(entityA, "alpha", 2, "second")
    expect(storage.get(entityA, "alpha", 1)).toBe("first")
    expect(storage.get(entityA, "alpha", 2)).toBe("second")
  })

  test("set with nil deletes", () => {
    storage.set(entityA, "alpha", 1, "hello")
    storage.set(entityA, "alpha", 1, nil)
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
  })
})

describe("delete()", () => {
  test("removes entry", () => {
    storage.set(entityA, "alpha", 1, "hello")
    storage.delete(entityA, "alpha", 1)
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
  })

  test("does nothing for missing entry", () => {
    storage.delete(entityA, "alpha", 1)
    expect(storage.get(entityA, "alpha", 1)).toBeNil()
  })
})

describe("deleteAllOfType()", () => {
  test("removes all stages for one type, preserves other types", () => {
    storage.set(entityA, "alpha", 1, "a")
    storage.set(entityA, "alpha", 2, "b")
    storage.set(entityA, "beta", 1, 10)

    storage.deleteAllOfType(entityA, "alpha")

    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "beta", 1)).toBe(10)
  })
})

describe("deleteAllForEntity()", () => {
  test("removes all types and stages", () => {
    storage.set(entityA, "alpha", 1, "a")
    storage.set(entityA, "alpha", 2, "b")
    storage.set(entityA, "beta", 1, 10)

    storage.deleteAllForEntity(entityA)

    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "beta", 1)).toBeNil()
  })
})

describe("iterateType()", () => {
  test("yields all stage-value pairs for a type", () => {
    storage.set(entityA, "alpha", 1, "a")
    storage.set(entityA, "alpha", 3, "c")

    const results = new LuaMap<number, string>()
    for (const [stage, value] of storage.iterateType(entityA, "alpha")) {
      results.set(stage, value)
    }
    expect(results.get(1)).toBe("a")
    expect(results.get(3)).toBe("c")
  })

  test("yields nothing for missing type", () => {
    let count = 0
    for (const [,] of storage.iterateType(entityA, "alpha")) {
      count++
    }
    expect(count).toBe(0)
  })
})

describe("hasAnyOfType()", () => {
  test("returns false for missing type", () => {
    expect(storage.hasAnyOfType(entityA, "alpha")).toBe(false)
  })

  test("returns true when type has entries", () => {
    storage.set(entityA, "alpha", 1, "hello")
    expect(storage.hasAnyOfType(entityA, "alpha")).toBe(true)
  })

  test("returns false after all entries deleted", () => {
    storage.set(entityA, "alpha", 1, "hello")
    storage.delete(entityA, "alpha", 1)
    expect(storage.hasAnyOfType(entityA, "alpha")).toBe(false)
  })
})

describe("hasInRange()", () => {
  test("returns true when entry exists in range", () => {
    storage.set(entityA, "alpha", 3, "hello")
    expect(storage.hasInRange(entityA, "alpha", 1, 5)).toBe(true)
    expect(storage.hasInRange(entityA, "alpha", 3, 3)).toBe(true)
  })

  test("returns false when no entry in range", () => {
    storage.set(entityA, "alpha", 3, "hello")
    expect(storage.hasInRange(entityA, "alpha", 1, 2)).toBe(false)
    expect(storage.hasInRange(entityA, "alpha", 4, 5)).toBe(false)
  })

  test("returns false for missing type", () => {
    expect(storage.hasInRange(entityA, "alpha", 1, 5)).toBe(false)
  })
})

describe("shiftStageKeysUp()", () => {
  test("shifts keys >= fromStage up by 1", () => {
    storage.set(entityA, "alpha", 1, "a")
    storage.set(entityA, "alpha", 2, "b")
    storage.set(entityA, "alpha", 3, "c")

    storage.shiftStageKeysUp(entityA, 2)

    expect(storage.get(entityA, "alpha", 1)).toBe("a")
    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "alpha", 3)).toBe("b")
    expect(storage.get(entityA, "alpha", 4)).toBe("c")
  })

  test("shifts all types", () => {
    storage.set(entityA, "alpha", 2, "a")
    storage.set(entityA, "beta", 2, 42)

    storage.shiftStageKeysUp(entityA, 2)

    expect(storage.get(entityA, "alpha", 2)).toBeNil()
    expect(storage.get(entityA, "alpha", 3)).toBe("a")
    expect(storage.get(entityA, "beta", 2)).toBeNil()
    expect(storage.get(entityA, "beta", 3)).toBe(42)
  })
})

describe("shiftStageKeysDown()", () => {
  test("deletes at fromStage and shifts keys > fromStage down by 1", () => {
    storage.set(entityA, "alpha", 1, "a")
    storage.set(entityA, "alpha", 2, "b")
    storage.set(entityA, "alpha", 3, "c")

    storage.shiftStageKeysDown(entityA, 2)

    expect(storage.get(entityA, "alpha", 1)).toBe("a")
    expect(storage.get(entityA, "alpha", 2)).toBe("c")
    expect(storage.get(entityA, "alpha", 3)).toBeNil()
  })

  test("shifts all types", () => {
    storage.set(entityA, "alpha", 2, "a")
    storage.set(entityA, "alpha", 3, "b")
    storage.set(entityA, "beta", 2, 10)
    storage.set(entityA, "beta", 3, 20)

    storage.shiftStageKeysDown(entityA, 2)

    expect(storage.get(entityA, "alpha", 2)).toBe("b")
    expect(storage.get(entityA, "alpha", 3)).toBeNil()
    expect(storage.get(entityA, "beta", 2)).toBe(20)
    expect(storage.get(entityA, "beta", 3)).toBeNil()
  })
})

describe("multiple entities", () => {
  test("are independent", () => {
    storage.set(entityA, "alpha", 1, "fromA")
    storage.set(entityB, "alpha", 1, "fromB")

    expect(storage.get(entityA, "alpha", 1)).toBe("fromA")
    expect(storage.get(entityB, "alpha", 1)).toBe("fromB")

    storage.deleteAllForEntity(entityA)

    expect(storage.get(entityA, "alpha", 1)).toBeNil()
    expect(storage.get(entityB, "alpha", 1)).toBe("fromB")
  })
})

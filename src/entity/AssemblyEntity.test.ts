import { AssemblyEntity, Entity, getEntityDiff, getValueAtLayer } from "./AssemblyEntity"
import { getNilPlaceholder } from "./NilPlaceholder"

test("getEntityDiff", () => {
  const entity1 = {
    name: "1",
    direction: 0,
    position: { x: 0, y: 0 },
    changedProp: { x: 1, y: 2 },
    simpleUnchanged: "unchanged",
    unchanged: { x: 1, y: 2 },
    setToNil: "setToNil",
  }
  const entity2 = {
    name: "2",
    direction: 1,
    position: { x: 1, y: 1 },
    changedProp: { x: 2, y: 2 },
    simpleUnchanged: "unchanged",
    unchanged: { x: 1, y: 2 },
  }
  const diff = getEntityDiff(entity1, entity2)
  assert.same(
    {
      name: "2",
      changedProp: { x: 2, y: 2 },
      setToNil: getNilPlaceholder(),
    },
    diff,
  )
})

describe("getValueAtLayer", () => {
  interface FooEntity extends Entity {
    foo1: number
    foo2?: number | nil
  }
  const entity: AssemblyEntity<FooEntity> = {
    categoryName: "foo",
    position: { x: 0, y: 0 },
    layerNumber: 2,
    direction: nil,
    baseEntity: {
      name: "foo",
      foo1: 1,
      foo2: 2,
    },
  }

  let changingEntity: AssemblyEntity<FooEntity>
  before_all(() => {
    changingEntity = {
      ...entity,
      layerChanges: {
        3: {
          foo1: 3,
          foo2: 4,
        },
        5: {
          foo1: 5,
        },
        7: {
          foo2: getNilPlaceholder(),
        },
      },
    }
  })

  test("nil if lower than layer", () => {
    assert.nil(getValueAtLayer(changingEntity, 1))
  })

  test("getValueAtLayer returns same entity if no layerChanges", () => {
    assert.equal(entity.baseEntity, getValueAtLayer(entity, 2))
  })

  test("applies changes from one layer", () => {
    const result = getValueAtLayer(changingEntity, 3)
    assert.same({ ...entity.baseEntity, foo1: 3, foo2: 4 }, result)
  })

  test("applies changes from multiple layers", () => {
    const result = getValueAtLayer(changingEntity, 5)
    assert.same({ ...entity.baseEntity, foo1: 5, foo2: 4 }, result)
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = getValueAtLayer(changingEntity, 7)
    const expected = { ...entity.baseEntity, foo1: 5 }
    delete expected.foo2

    assert.same(expected, result)
  })
})

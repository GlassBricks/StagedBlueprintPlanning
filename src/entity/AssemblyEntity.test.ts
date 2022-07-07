import { AssemblyEntity, Entity, getValueAtLayer } from "./AssemblyEntity"
import { getNilPlaceholder } from "./NilPlaceholder"

describe("getValueAtLayer", () => {
  interface FooEntity extends Entity {
    foo1: number
    foo2?: number | nil
  }
  const sameEntity: AssemblyEntity<FooEntity> = {
    layerNumber: 2,
    name: "foo",
    position: { x: 0, y: 0 },
    foo1: 1,
    foo2: 2,
  }

  let changingEntity: AssemblyEntity<FooEntity>
  before_all(() => {
    changingEntity = {
      ...sameEntity,
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
    assert.same(sameEntity, getValueAtLayer(sameEntity, 2))
  })

  test("applies changes from one layer", () => {
    const result = getValueAtLayer(changingEntity, 3)
    assert.same(
      {
        ...sameEntity,
        foo1: 3,
        foo2: 4,
      },
      result,
    )
  })

  test("applies changes from multiple layers", () => {
    const result = getValueAtLayer(changingEntity, 5)
    assert.same(
      {
        ...sameEntity,
        foo1: 5,
        foo2: 4,
      },
      result,
    )
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = getValueAtLayer(changingEntity, 7)
    const expected = {
      ...sameEntity,
      foo1: 5,
    }
    delete expected.foo2

    assert.same(expected, result)
  })
})

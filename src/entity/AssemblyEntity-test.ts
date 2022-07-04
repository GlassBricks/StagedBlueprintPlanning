import { AssemblyEntity, Entity, getValueAtLayer } from "./AssemblyEntity"
import { getNilPlaceholder } from "./NilPlaceholder"

describe("getValueAtLayer", () => {
  interface FooEntity extends Entity {
    foo1: number
    foo2?: number | nil
  }
  const fooEntity: FooEntity = {
    name: "foo",
    position: { x: 0, y: 0 },
    foo1: 1,
    foo2: 2,
  }

  let assemblyEntity: AssemblyEntity<FooEntity>
  before_all(() => {
    assemblyEntity = {
      ...fooEntity,
      layerChanges: {
        1: {
          foo1: 3,
          foo2: 4,
        },
        3: {
          foo1: 5,
        },
        5: {
          foo2: getNilPlaceholder(),
        },
      },
    }
  })

  test("getValueAtLayer returns same entity if no layerChanges", () => {
    assert.same(fooEntity, getValueAtLayer(fooEntity, 1))
  })

  test("applies changes from one layer", () => {
    const result = getValueAtLayer(assemblyEntity, 1)
    assert.same(
      {
        ...fooEntity,
        foo1: 3,
        foo2: 4,
      },
      result,
    )
  })

  test("applies changes from multiple layers", () => {
    const result = getValueAtLayer(assemblyEntity, 3)
    assert.same(
      {
        ...fooEntity,
        foo1: 5,
        foo2: 4,
      },
      result,
    )
  })

  test("replaces nilPlaceholder with nil", () => {
    const result = getValueAtLayer(assemblyEntity, 5)
    const expected = {
      ...fooEntity,
      foo1: 5,
    }
    delete expected.foo2

    assert.same(expected, result)
  })
})

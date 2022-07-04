import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"
import { Entity } from "./AssemblyEntity"

let content: MutableAssemblyContent
before_all(() => {
  content = newAssemblyContent()
})

describe("findCompatible", () => {
  test("finds compatible if same name and direction", () => {
    const entity: Entity = { name: "test", position: { x: 0, y: 0 } }
    const lookup = {
      ...entity,
      foo: "bar",
    }
    content.add(entity)

    assert.equal(entity, content.findCompatible(lookup))
  })

  test("not compatible", () => {
    const entity: Entity = { name: "test", position: { x: 0, y: 0 } }

    const lookup1 = {
      ...entity,
      name: "test2",
    }
    const lookup2 = {
      ...entity,
      direction: defines.direction.north,
    }
    assert.nil(content.findCompatible(lookup1))
    assert.nil(content.findCompatible(lookup2))
  })
})

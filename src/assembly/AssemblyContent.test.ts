import { AssemblyEntity, createAssemblyEntity } from "../entity/AssemblyEntity"
import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"

let content: MutableAssemblyContent
before_all(() => {
  content = newAssemblyContent()
})

describe("findCompatible", () => {
  test("finds compatible if same name and direction", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    content.add(entity)

    assert.equal(entity, content.findCompatible({ name: "foo" }, { x: 0, y: 0 }, nil))
  })

  test("not compatible", () => {
    const entity: AssemblyEntity = createAssemblyEntity({ name: "foo" }, { x: 0, y: 0 }, 0, 1)
    assert.nil(content.findCompatible({ name: "test2" }, entity.position, nil))
    assert.nil(content.findCompatible({ name: "foo" }, entity.position, defines.direction.south))
  })
})

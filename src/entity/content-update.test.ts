import { Pos, PositionClass } from "../lib/geometry"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"
import { entityAdded, entityDeleted } from "./content-update"

let content: MutableAssemblyContent
let area: WorldArea
let leftTop: MapPositionTable
before_each(() => {
  content = newAssemblyContent()
  area = clearTestArea()
  leftTop = area.bbox.left_top
})

describe("simple add, delete", () => {
  let pos: PositionClass
  before_all(() => {
    pos = Pos(10.5, 10.5)
  })
  function doAdd(params: Partial<SurfaceCreateEntity> = {}) {
    const params1 = {
      name: "iron-chest",
      position: Pos.plus(pos, leftTop),
      force: "player",
      ...params,
    }
    const entity = area.surface.create_entity(params1)!
    entityAdded(content, assert(entity), leftTop)
    return {
      entity,
      found: content.findCompatible({
        name: params1.name,
        position: pos,
        direction: (params1 as any).direction,
      }),
    }
  }

  test("simple entity add", () => {
    const found = doAdd().found!
    assert.not_nil(found)
    assert.equal("iron-chest", found.name)
    assert.same(pos, found.position)
    assert.nil(found.direction)
  })

  test.each(
    [{ name: "entity-ghost", inner_name: "iron-chest" }, { force: "enemy" }, { name: "tree-01" }],
    "not added if %s",
    (params) => {
      doAdd(params)
      assert.same({}, content.entities)
    },
  )

  test("deleted after add", () => {
    const { entity } = doAdd()
    entityDeleted(content, entity, leftTop) // simulated
    assert.same({}, content.entities)
  })
})

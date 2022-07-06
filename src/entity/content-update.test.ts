import { Pos, PositionClass } from "../lib/geometry"
import { clearTestArea } from "../test-util/area"
import { getLeftTop, WorldArea, WorldPosition } from "../utils/world-location"
import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"
import { AssemblyEntity } from "./AssemblyEntity"
import { createEntityInWorld, entityAdded, entityDeleted } from "./content-update"

let content: MutableAssemblyContent
let area: WorldArea
let leftTop: WorldPosition
before_each(() => {
  content = newAssemblyContent()
  area = clearTestArea()
  leftTop = getLeftTop(area)
})

describe("simple entity", () => {
  let pos: PositionClass
  before_all(() => {
    pos = Pos(10.5, 10.5)
  })
  function doAdd(params: Partial<SurfaceCreateEntity> = {}) {
    const params1 = {
      name: "iron-chest",
      position: Pos.plus(pos, leftTop.position),
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

  test("create in world", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
    }
    const created = createEntityInWorld(entity, leftTop)!
    assert.not_nil(created)
    assert.same(created.position, Pos.plus(entity.position, leftTop.position))
  })
})

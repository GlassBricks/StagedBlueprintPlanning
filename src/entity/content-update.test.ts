import { Pos, PositionClass } from "../lib/geometry"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"
import { AssemblyEntity } from "./AssemblyEntity"
import {
  createEntityInWorld,
  deleteEntityInWorld,
  entityAdded,
  entityDeleted,
  LayerContext,
  placeAssemblyInWorld,
} from "./content-update"

let content: MutableAssemblyContent
let area: WorldArea
let layerContext: LayerContext
before_each(() => {
  content = newAssemblyContent()
  area = clearTestArea()
  layerContext = {
    surface: area.surface,
    leftTop: area.bbox.left_top,
    layerNumber: 1,
  }
})

describe("simple entity", () => {
  let pos: PositionClass
  before_all(() => {
    pos = Pos(10.5, 10.5)
  })
  function doAdd(params: Partial<SurfaceCreateEntity> = {}) {
    const params1 = {
      name: "iron-chest",
      position: Pos.plus(pos, layerContext.leftTop),
      force: "player",
      ...params,
    }
    const entity = area.surface.create_entity(params1)!
    entityAdded(content, assert(entity), layerContext)
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
    entityDeleted(content, entity, layerContext) // simulated
    assert.same({}, content.entities)
  })

  test("create in world", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 1,
    }
    const created = createEntityInWorld(entity, layerContext)!
    assert.not_nil(created)
    assert.same(created.position, Pos.plus(entity.position, layerContext.leftTop))
  })

  test("not created if not in layer", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 2,
    }
    const created = createEntityInWorld(entity, layerContext)
    assert.nil(created)
  })

  test("delete in world", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 1,
    }
    const created = createEntityInWorld(entity, layerContext)!
    deleteEntityInWorld(entity, layerContext)
    assert.false(created.valid)
  })

  test("simple place assembly in world", () => {
    const entities: AssemblyEntity[] = [
      {
        name: "iron-chest",
        position: Pos(10.5, 10.5),
        layerNumber: 1,
      },
      {
        name: "iron-chest",
        position: Pos(10.5, 11.5),
        layerNumber: 1,
      },
      {
        name: "iron-chest",
        position: Pos(11.5, 10.5),
        layerNumber: 2, // should not be placed
      },
    ]
    for (const entity of entities) content.add(entity)

    placeAssemblyInWorld(content, layerContext)

    for (const entity of entities) {
      const found = area.surface.find_entity(entity.name, Pos.plus(entity.position, layerContext.leftTop))
      if (entity.layerNumber === 1) {
        assert.not_nil(found)
      } else {
        assert.nil(found)
      }
    }
  })
})

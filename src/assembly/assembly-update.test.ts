import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { Pos, PositionClass } from "../lib/geometry"
import { map2dSize } from "../lib/map2d"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { Layer } from "./Assembly"
import {
  AssemblyUpdateHandler,
  AssemblyUpdateType,
  createEntityInWorld,
  deleteEntityInWorld,
  entityDeleted,
  findCompatibleEntityInWorld,
  onEntityAdded,
  placeAssemblyInWorld,
} from "./assembly-update"
import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"

let content: MutableAssemblyContent
let area: WorldArea
let layer: Mutable<Layer>
let events: Array<{ type: AssemblyUpdateType; entity: AssemblyEntity; layer: LayerNumber }>
let updateHandler: AssemblyUpdateHandler
let pos: PositionClass
before_each(() => {
  content = newAssemblyContent()
  area = clearTestArea()
  layer = {
    ...area,
    layerNumber: 1,
  }
  events = []
})
before_all(() => {
  pos = Pos(10.5, 10.5)
  updateHandler = (type, entity, layer) => {
    events.push({ type, entity, layer })
  }
})

describe("add", () => {
  function doAdd() {
    const entity = area.surface.create_entity({
      name: "iron-chest",
      position: Pos.plus(pos, layer.bbox.left_top),
      force: "player",
    })!
    const added = onEntityAdded(assert(entity), layer, content, updateHandler)
    return { luaEntity: entity, added }
  }

  test("new", () => {
    const { added } = doAdd()
    const found = content.findCompatible({
      name: "iron-chest",
      position: pos,
    })!
    assert.equal(added, found)
    assert.not_nil(found)
    assert.equal("iron-chest", found.name)
    assert.same(pos, found.position)
    assert.nil(found.direction)

    assert.equal(events.length, 1)
    assert.same(
      {
        type: "created",
        entity: found,
        layer: layer.layerNumber,
      },
      events[0],
    )
  })

  test.each([1, 2], "existing at layer 1, added at layer %d", (layerNumber) => {
    const { luaEntity, added } = doAdd()
    layer.layerNumber = layerNumber
    events = []
    const added2 = onEntityAdded(luaEntity, layer, content, updateHandler) // again

    assert.equal(added, added2)

    assert.equal(1, map2dSize(content.entities))
    assert.equal(events.length, 1)
    assert.same(
      {
        type: "refreshed",
        entity: added,
        layer: layer.layerNumber,
      },
      events[0],
    )
  })

  test.todo("added at previous layer")

  test("deleted after add", () => {
    const { luaEntity: added } = doAdd()
    entityDeleted(layer, content, added) // simulated
    assert.same({}, content.entities)
  })

  test("create in world", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 1,
    }
    const created = createEntityInWorld(layer, entity)!
    assert.not_nil(created)
    assert.same(created.position, Pos.plus(entity.position, layer.bbox.left_top))
  })

  test("returns same entity if exists in world", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 1,
    }
    const created = createEntityInWorld(layer, entity)
    const created2 = createEntityInWorld(layer, entity)
    assert.equal(created, created2)
  })

  test("not created if not in layer", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 2,
    }
    const created = createEntityInWorld(layer, entity)
    assert.nil(created)
  })

  test("findCompatibleEntityInWorld", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 1,
    }
    const created = createEntityInWorld(layer, entity)!
    const found = findCompatibleEntityInWorld(layer, entity)
    assert.equal(created, found)
  })

  test("delete in world", () => {
    const entity: AssemblyEntity = {
      name: "iron-chest",
      position: Pos(10.5, 10.5),
      layerNumber: 1,
    }
    const created = createEntityInWorld(layer, entity)!
    deleteEntityInWorld(layer, entity)
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

    placeAssemblyInWorld(layer, content)

    for (const entity of entities) {
      const found = area.surface.find_entity(entity.name, Pos.plus(entity.position, layer.bbox.left_top))
      if (entity.layerNumber === 1) {
        assert.not_nil(found)
      } else {
        assert.nil(found)
      }
    }
  })
})

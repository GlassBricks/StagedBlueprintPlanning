import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { Pos, PositionClass } from "../lib/geometry"
import { map2dSize } from "../lib/map2d"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { Layer } from "./Assembly"
import { AssemblyUpdateHandler, AssemblyUpdateType, entityDeleted, onEntityAdded } from "./assembly-update"
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
  function createEntity() {
    const entity = area.surface.create_entity({
      name: "iron-chest",
      position: Pos.plus(pos, layer.bbox.left_top),
      force: "player",
    })
    return assert(entity)
  }

  function doAdd() {
    const entity = createEntity()
    const added = onEntityAdded(entity, layer, content, updateHandler)
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

  test("delete non-existent", () => {
    const entity = createEntity()
    entityDeleted(entity, layer, content, updateHandler)
    assert.same([], events)
  })

  test.each([1, 3], "delete existing at different layer: %d", (origLayer) => {
    layer.layerNumber = origLayer
    const { luaEntity, added } = doAdd()
    layer.layerNumber = 2
    events = []
    entityDeleted(luaEntity, layer, content, updateHandler)
    assert.equal(1, map2dSize(content.entities))
    assert.equal(1, events.length)
    assert.same(
      {
        type: "deletion-forbidden",
        entity: added,
        layer: layer.layerNumber,
      },
      events[0],
    )
  })

  test("delete existing in same layer", () => {
    const { luaEntity, added } = doAdd()
    events = []
    entityDeleted(luaEntity, layer, content, updateHandler) // simulated
    assert.same({}, content.entities)
    assert.equal(1, events.length)
    assert.same(
      {
        type: "deleted",
        entity: added,
        layer: layer.layerNumber,
      },
      events[0],
    )
  })

  test.todo("delete entity with updates")
})

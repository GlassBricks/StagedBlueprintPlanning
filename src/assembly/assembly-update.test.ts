import { AssemblyEntity, Entity, LayerNumber } from "../entity/AssemblyEntity"
import { Mutable } from "../lib"
import { Pos } from "../lib/geometry"
import { map2dSize } from "../lib/map2d"
import { clearTestArea } from "../test-util/area"
import { WorldArea } from "../utils/world-location"
import { Layer } from "./Assembly"
import { AssemblyUpdateHandler, AssemblyUpdateType, entityDeleted, onEntityAdded } from "./assembly-update"
import { MutableAssemblyContent, newAssemblyContent } from "./AssemblyContent"

let content: MutableAssemblyContent
let area: WorldArea
let layer: Mutable<Layer>
let events: Array<{ type: AssemblyUpdateType; entity: AssemblyEntity; layer?: LayerNumber }>
let updateHandler: AssemblyUpdateHandler
interface ChestEntity extends Entity {
  readonly bar?: number
}

const pos = Pos(10.5, 10.5)

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
  updateHandler = (type, entity, layer) => {
    events.push({ type, entity, layer })
  }
})

describe("add", () => {
  function createEntity() {
    const entity = area.surface.create_entity({
      name: "iron-chest",
      position: pos.plus(layer.bbox.left_top),
      force: "player",
      bar: 2,
    })
    return assert(entity)
  }

  function doAdd() {
    const entity = createEntity()
    const added = onEntityAdded<ChestEntity>(entity, layer, content, updateHandler)
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

  test.each([false, true], "existing at layer 2, added at layer 1, with layer changes: %s", (withChanges) => {
    layer.layerNumber = 2
    const { luaEntity, added: oldAdded } = doAdd()
    events = []
    layer.layerNumber = 1

    if (withChanges) {
      luaEntity.get_inventory(defines.inventory.chest)!.set_bar(4) // actually sets to 3 available slots (bar _starts_ at 4)
    }
    const added2 = onEntityAdded<ChestEntity>(luaEntity, layer, content, updateHandler)! // again
    assert.not_equal(oldAdded, added2)

    assert.same(1, added2.layerNumber)
    if (!withChanges) {
      assert.equal(2, added2.bar)
      assert.nil(added2.layerChanges)
    } else {
      assert.equal(3, added2.bar)
      assert.same(
        {
          2: {
            bar: 2,
          },
        },
        added2.layerChanges,
      )
    }

    assert.equal(1, map2dSize(content.entities))
    assert.equal(events.length, 1)
    assert.same(
      {
        type: "created-below",
        entity: added2,
        layer: 2,
      },
      events[0],
    )
  })

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

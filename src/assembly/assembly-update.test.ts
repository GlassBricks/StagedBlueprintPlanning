import { AssemblyEntity, Entity, LayerNumber, MutableAssemblyEntity } from "../entity/AssemblyEntity"
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
    const added = onEntityAdded(entity, layer, content, updateHandler) as MutableAssemblyEntity<ChestEntity>
    return { luaEntity: entity, added }
  }

  test("new", () => {
    const { added } = doAdd()
    const found = content.findCompatible({ name: "iron-chest" }, pos, nil)!
    assert.equal(added, found)
    assert.not_nil(found)
    assert.equal("iron-chest", found.baseEntity.name)
    assert.same(pos, found.position)
    assert.nil(found.direction)

    assert.equal(events.length, 1)
    assert.same({ type: "added", entity: added }, events[0])
  })

  function doVirtualAdd(addedNum: LayerNumber = layer.layerNumber, setNum = layer.layerNumber) {
    layer.layerNumber = addedNum
    const ret = doAdd()
    layer.layerNumber = setNum
    events = []
    return ret
  }

  test.each([1, 2], "existing at layer 1, added at layer %d", (layerNumber) => {
    const { luaEntity, added } = doVirtualAdd(1, layerNumber)
    const added2 = onEntityAdded(luaEntity, layer, content, updateHandler) // again

    assert.equal(added, added2)

    assert.equal(1, map2dSize(content.entities))
    assert.equal(events.length, 1)
    assert.same({ type: "refreshed", entity: added, layer: layer.layerNumber }, events[0])
  })

  test.each([false, true], "existing at layer 2, added at layer 1, with layer changes: %s", (withChanges) => {
    const { luaEntity, added: oldAdded } = doVirtualAdd(2, 1)

    if (withChanges) {
      luaEntity.get_inventory(defines.inventory.chest)!.set_bar(4) // actually sets to 3 (bar _starts_ at 4)
    }
    const added = onEntityAdded<ChestEntity>(luaEntity, layer, content, updateHandler)! // again
    assert.equal(oldAdded, added)

    assert.same(1, added.layerNumber)
    if (!withChanges) {
      assert.equal(2, added.baseEntity.bar)
      assert.nil(added.layerChanges)
    } else {
      assert.equal(3, added.baseEntity.bar)
      assert.same(
        {
          2: {
            bar: 2,
          },
        },
        added.layerChanges,
      )
    }

    assert.equal(1, map2dSize(content.entities))
    assert.equal(events.length, 1)
    assert.same(
      {
        type: "addedBelow",
        entity: added,
      },
      events[0],
    )
  })

  test("delete non-existent", () => {
    const entity = createEntity()
    entityDeleted(entity, layer, content, updateHandler)
    assert.same([], events)
    assert.same({}, content.entities)
  })

  test("delete existing at higher layer (bug)", () => {
    const { luaEntity } = doVirtualAdd(2, 1)
    entityDeleted(luaEntity, layer, content, updateHandler)
    assert.same([], events)
    assert.equal(1, map2dSize(content.entities))
  })

  test("delete existing at lower layer", () => {
    const { luaEntity, added } = doVirtualAdd(1, 2)
    entityDeleted(luaEntity, layer, content, updateHandler)
    assert.equal(1, map2dSize(content.entities))
    assert.equal(1, events.length)
    assert.same(
      {
        type: "deletionForbidden",
        entity: added,
        layer: layer.layerNumber,
      },
      events[0],
    )
  })

  test("delete existing at same layer", () => {
    const { luaEntity, added } = doVirtualAdd()
    entityDeleted(luaEntity, layer, content, updateHandler) // simulated
    assert.same({}, content.entities)
    assert.equal(1, events.length)
    assert.same(
      {
        type: "deleted",
        entity: added,
      },
      events[0],
    )
  })

  test("delete entity with updates", () => {
    const { luaEntity, added } = doVirtualAdd()
    added.layerChanges = { 2: { bar: 3 } }
    entityDeleted(luaEntity, layer, content, updateHandler)
    assert.same(1, map2dSize(content.entities))
    assert.true(added.isLostReference)
    assert.equal(1, events.length)
    assert.same(
      {
        type: "deletedMadeLostReference",
        entity: added,
      },
      events[0],
    )
  })

  test.each([1, 2, 3, 4, 5, 6], "lost reference 1->3->5, revive at layer %d", (reviveLayer) => {
    const { luaEntity, added } = doVirtualAdd(1, reviveLayer)
    added.layerChanges = { 3: { bar: 3 }, 5: { bar: 4 } }
    added.isLostReference = true

    const revived = onEntityAdded<ChestEntity>(luaEntity, layer, content, updateHandler)!
    assert.falsy(revived.isLostReference)
    assert.equal(revived.layerNumber, reviveLayer)

    if (reviveLayer >= 5) {
      assert.nil(revived.layerChanges)
      assert.equal(4, revived.baseEntity.bar)
    } else if (reviveLayer >= 3) {
      assert.same({ 5: { bar: 4 } }, revived.layerChanges)
      assert.equal(3, revived.baseEntity.bar)
    } else {
      assert.same({ 3: { bar: 3 }, 5: { bar: 4 } }, revived.layerChanges)
      assert.equal(2, revived.baseEntity.bar)
    }

    assert.equal(1, map2dSize(content.entities))
    assert.equal(1, events.length)
    assert.same(
      {
        type: "revived",
        entity: revived,
      },
      events[0],
    )
  })

  test.each([false, true], "lost reference 2->3, revive at layer 1, with changes: %s", (withChanges) => {
    const { luaEntity, added } = doVirtualAdd(2, 1)
    added.layerChanges = { 3: { bar: 3 } }
    added.isLostReference = true

    if (withChanges) luaEntity.get_inventory(defines.inventory.chest)!.set_bar(2) // actually = 1

    const revived = onEntityAdded<ChestEntity>(luaEntity, layer, content, updateHandler)!
    assert.falsy(revived.isLostReference)
    assert.equal(revived.layerNumber, 1)

    if (!withChanges) {
      assert.equal(2, revived.baseEntity.bar)
      assert.same({ 3: { bar: 3 } }, revived.layerChanges)
    } else {
      assert.equal(1, revived.baseEntity.bar)
      assert.same({ 2: { bar: 2 }, 3: { bar: 3 } }, revived.layerChanges)
    }

    assert.equal(1, map2dSize(content.entities))
    assert.equal(1, events.length)
    assert.same(
      {
        type: "revivedBelow",
        entity: revived,
      },
      events[0],
    )
  })
})

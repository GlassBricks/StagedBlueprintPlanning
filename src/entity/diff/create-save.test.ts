import { Pos, Position } from "../../lib/geometry"
import { clearTestArea } from "../../test-util/area"
import { leftTop, WorldArea } from "../../utils/world-location"
import { createEntity, saveEntity } from "./index"
import plus = Pos.plus

let area: WorldArea
let entity: LuaEntity
let actualPos: Position

before_all(() => {
  area = clearTestArea()
  const relPos: Position = { x: 0.5, y: 0.5 }
  actualPos = plus(area.bbox.left_top, relPos)
  entity =
    area.surface.create_entity({
      name: "iron-chest",
      position: actualPos,
      force: "player",
    }) ?? error("Failed to create entity")
})
after_all(clearTestArea)

test("save", () => {
  const saved = assert(saveEntity(entity, area.bbox.left_top))
  assert.equal("iron-chest", saved.name)
  assert.same({ x: 0.5, y: 0.5 }, saved.position)
  assert.nil(saved.direction)
})

test("create", () => {
  const saved = saveEntity(entity, area.bbox.left_top)!
  createEntity(saved, leftTop(area))
  const found = area.surface.find_entity("iron-chest", actualPos)!
  assert(found)
  assert.equal("iron-chest", found.name)
  assert.same(actualPos, found.position)
  assert.equal(defines.direction.north, found.direction)
})

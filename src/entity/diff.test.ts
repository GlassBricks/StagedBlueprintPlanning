import { clearTestArea } from "../test-util/area"
import { getEntityDiff, saveEntity } from "./diff"
import { getNilPlaceholder } from "./NilPlaceholder"

test("save basic entity", () => {
  const area = clearTestArea()
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
  })!
  const saved = saveEntity(entity, { ...area, layerNumber: 1 })
  assert.same(
    {
      name: "iron-chest",
      layerNumber: 1,
      position: { x: 10.5, y: 10.5 },
    },
    saved,
  )
})

test("getEntityDiff", () => {
  const entity1 = {
    name: "1",
    direction: 0,
    position: { x: 0, y: 0 },
    changedProp: { x: 1, y: 2 },
    simpleUnchanged: "unchanged",
    unchanged: { x: 1, y: 2 },
    setToNil: "setToNil",
  }
  const entity2 = {
    name: "2",
    direction: 1,
    position: { x: 1, y: 1 },
    changedProp: { x: 2, y: 2 },
    simpleUnchanged: "unchanged",
    unchanged: { x: 1, y: 2 },
  }
  const diff = getEntityDiff(entity1, entity2)
  assert.same(
    {
      name: "2",
      changedProp: { x: 2, y: 2 },
      setToNil: getNilPlaceholder(),
    },
    diff,
  )
})

import { clearTestArea } from "../test-util/area"
import { saveEntity } from "./diff"

test("save basic entity", () => {
  const area = clearTestArea()
  const entity = area.surface.create_entity({
    name: "iron-chest",
    position: { x: 12.5, y: 12.5 },
    force: "player",
    bar: 3,
  })!
  const saved = saveEntity(entity)
  assert.same({ name: "iron-chest", bar: 3 }, saved)
})

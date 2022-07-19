import { Events, Mutable } from "../../lib"
import { BBox } from "../../lib/geometry"
import { WorldPosition } from "../../utils/world-location"
import { DiffHandler } from "./DiffHandler"

declare const global: {
  tempBPInventory: LuaInventory
}

Events.on_init(() => {
  global.tempBPInventory = game.create_inventory(1)
})

function getTempItemStack(): BlueprintItemStack {
  const stack = global.tempBPInventory[0]
  stack.set_stack("blueprint")
  return stack
}

function findEntityIndex(mapping: Record<number, LuaEntity>, entity: LuaEntity): number | nil {
  for (const [index, mEntity] of pairs(mapping)) {
    if (entity === mEntity) return index
  }
}

function reviveGhost(ghost: GhostEntity): LuaEntity | nil {
  if (!ghost.valid) return
  const [, entity, requestProxy] = ghost.silent_revive({
    return_item_request_proxy: true,
  })
  if (entity === nil) return

  if (!requestProxy) return entity

  // manually add items from request proxy
  const requests = requestProxy.item_requests
  const moduleInventory = entity.get_module_inventory()
  if (moduleInventory) {
    for (const [item, amount] of pairs(requests)) {
      moduleInventory.insert({ name: item, count: amount })
    }
  } else {
    for (const [item, amount] of pairs(requests)) {
      entity.insert({ name: item, count: amount })
    }
  }
  requestProxy.destroy()
  return entity
}

export const BlueprintDiffHandler: DiffHandler<BlueprintEntityRead> = {
  save(entity: LuaEntity): BlueprintEntityRead | nil {
    const { surface, position } = entity
    const stack = getTempItemStack()

    const indexMapping = stack.create_blueprint({
      surface,
      force: "player",
      area: BBox.around(position, 0.01),
    })
    const matchingIndex = findEntityIndex(indexMapping, entity)
    if (!matchingIndex) return

    const bpEntity = stack.get_blueprint_entities()![matchingIndex - 1] as Mutable<BlueprintEntityRead>
    assert(bpEntity.entity_number === matchingIndex)
    bpEntity.entity_number = nil!
    bpEntity.position = nil!
    bpEntity.direction = nil
    return bpEntity
  },

  create(saved: BlueprintEntityRead, { surface, position }: WorldPosition): void {
    const stack = getTempItemStack()
    stack.set_blueprint_entities([saved])
    stack.blueprint_absolute_snapping = true
    stack.blueprint_snap_to_grid = [1, 1]

    const ghosts = stack.build_blueprint({
      surface,
      force: "player",
      position,
      skip_fog_of_war: false,
      // raise_built: true,
    })
    for (const ghost of ghosts) reviveGhost(ghost)
  },
}

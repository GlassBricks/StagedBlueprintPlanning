import { AssemblyEntity, isCompatibleEntity, LayerNumber } from "../entity/AssemblyEntity"
import { BBox, Pos } from "../lib/geometry"
import { WorldArea } from "../utils/world-location"
import { AssemblyContent, MutableAssemblyContent } from "./AssemblyContent"

export interface LayerContext extends WorldArea {
  readonly surface: LuaSurface
  readonly bbox: BBox
  readonly layerNumber: LayerNumber
}

export function isAssemblyEntity(entity: LuaEntity): boolean {
  return entity.type !== "entity-ghost" && entity.force.name === "player" && "player-creation" in entity.prototype.flags
}

export function entityAdded(context: LayerContext, content: MutableAssemblyContent, entity: LuaEntity): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.bbox.left_top)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  content.add({
    name: entity.name,
    position,
    direction: entity.supports_direction ? entity.direction : nil,
    layerNumber: context.layerNumber,
  })
}

export function entityDeleted(context: LayerContext, content: MutableAssemblyContent, entity: LuaEntity): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.bbox.left_top)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  const compatible = content.findCompatible(entity, position)
  if (compatible) {
    content.remove(compatible)
  }
}

export function createEntityInWorld(context: LayerContext, entity: AssemblyEntity): LuaEntity | nil {
  if (entity.layerNumber > context.layerNumber) return nil
  const { name, position, direction } = entity
  return context.surface.create_entity({
    name,
    position: Pos.plus(position, context.bbox.left_top),
    direction,
    force: "player",
  })
}

export function deleteEntityInWorld(context: LayerContext, entity: AssemblyEntity): void {
  const { name, position, direction } = entity
  const worldPosition = Pos.plus(position, context.bbox.left_top)
  // find entity that matches
  const candidates = context.surface.find_entities_filtered({
    position: worldPosition,
    name,
    direction: direction ?? 0,
    to_be_deconstructed: false,
  })
  for (const candidate of candidates) {
    if (
      isAssemblyEntity(candidate) &&
      Pos.equals(candidate.position, worldPosition) &&
      isCompatibleEntity(candidate, entity)
    ) {
      candidate.destroy()
      return
    }
  }
}

export function placeAssemblyInWorld(context: LayerContext, content: AssemblyContent): LuaEntity[] {
  const result: LuaEntity[] = []
  for (const [, byX] of pairs(content.entities)) {
    for (const [, entities] of pairs(byX))
      for (const entity of entities) {
        const luaEntity = createEntityInWorld(context, entity)
        if (luaEntity) result.push(luaEntity)
      }
  }
  return result
}

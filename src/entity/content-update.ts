import { Pos } from "../lib/geometry"
import { WorldPosition } from "../utils/world-location"
import { AssemblyContent, isCompatibleEntity, MutableAssemblyContent } from "./AssemblyContent"
import { AssemblyEntity } from "./AssemblyEntity"

// export interface UpdateContext {
//   topLeft: Position
// }
export type UpdateContext = WorldPosition

export function isAssemblyEntity(entity: LuaEntity): boolean {
  return entity.type !== "entity-ghost" && entity.force.name === "player" && "player-creation" in entity.prototype.flags
}

export function entityAdded(content: MutableAssemblyContent, entity: LuaEntity, context: UpdateContext): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.position)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  content.add({
    name: entity.name,
    position,
    direction: entity.supports_direction ? entity.direction : nil,
  })
}

export function entityDeleted(content: MutableAssemblyContent, entity: LuaEntity, context: UpdateContext): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.position)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  const compatible = content.findCompatible(entity, position)
  if (compatible) {
    content.remove(compatible)
  }
}

export function createEntityInWorld(entity: AssemblyEntity, context: UpdateContext): LuaEntity | nil {
  const { name, position, direction } = entity
  return context.surface.create_entity({
    name,
    position: Pos.plus(position, context.position),
    direction,
    force: "player",
  })
}

export function deleteEntityInWorld(entity: AssemblyEntity, context: UpdateContext): void {
  const { name, position, direction } = entity
  const worldPosition = Pos.plus(position, context.position)
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

export function placeAssemblyInWorld(content: AssemblyContent, context: UpdateContext): LuaEntity[] {
  const result: LuaEntity[] = []
  for (const [, byX] of pairs(content.entities)) {
    for (const [, entities] of pairs(byX))
      for (const entity of entities) {
        const luaEntity = createEntityInWorld(entity, context)
        if (luaEntity) result.push(luaEntity)
      }
  }
  return result
}

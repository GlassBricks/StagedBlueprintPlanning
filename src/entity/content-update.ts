import { Pos } from "../lib/geometry"
import { WorldPosition } from "../utils/world-location"
import { MutableAssemblyContent } from "./AssemblyContent"
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
  })
}

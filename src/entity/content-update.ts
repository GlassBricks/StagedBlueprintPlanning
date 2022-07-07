import { Pos, Position } from "../lib/geometry"
import { AssemblyContent, isCompatibleEntity, MutableAssemblyContent } from "./AssemblyContent"
import { AssemblyEntity, LayerNumber } from "./AssemblyEntity"

// export interface UpdateContext {
//   topLeft: Position
// }
export interface LayerContext {
  readonly surface: LuaSurface
  readonly leftTop: Position
  readonly layerNumber: LayerNumber
}

export function isAssemblyEntity(entity: LuaEntity): boolean {
  return entity.type !== "entity-ghost" && entity.force.name === "player" && "player-creation" in entity.prototype.flags
}

export function entityAdded(content: MutableAssemblyContent, entity: LuaEntity, context: LayerContext): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.leftTop)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  content.add({
    name: entity.name,
    position,
    direction: entity.supports_direction ? entity.direction : nil,
    layerNumber: context.layerNumber,
  })
}

export function entityDeleted(content: MutableAssemblyContent, entity: LuaEntity, context: LayerContext): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.leftTop)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  const compatible = content.findCompatible(entity, position)
  if (compatible) {
    content.remove(compatible)
  }
}

export function createEntityInWorld(entity: AssemblyEntity, context: LayerContext): LuaEntity | nil {
  if (entity.layerNumber > context.layerNumber) return nil
  const { name, position, direction } = entity
  return context.surface.create_entity({
    name,
    position: Pos.plus(position, context.leftTop),
    direction,
    force: "player",
  })
}

export function deleteEntityInWorld(entity: AssemblyEntity, context: LayerContext): void {
  const { name, position, direction } = entity
  const worldPosition = Pos.plus(position, context.leftTop)
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

export function placeAssemblyInWorld(content: AssemblyContent, context: LayerContext): LuaEntity[] {
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

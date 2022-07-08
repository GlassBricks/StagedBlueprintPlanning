import { AssemblyEntity, Entity } from "../entity/AssemblyEntity"
import { Pos } from "../lib/geometry"
import { Layer } from "./Assembly"
import { AssemblyContent, MutableAssemblyContent } from "./AssemblyContent"

export function isAssemblyEntity(entity: LuaEntity): boolean {
  return entity.type !== "entity-ghost" && entity.force.name === "player" && "player-creation" in entity.prototype.flags
}

export function entityAdded(context: Layer, content: MutableAssemblyContent, entity: LuaEntity): void {
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

export function entityDeleted(context: Layer, content: MutableAssemblyContent, entity: LuaEntity): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, context.bbox.left_top)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  const compatible = content.findCompatible(entity, position)
  if (compatible) {
    content.remove(compatible)
  }
}

export function findCompatibleEntityInWorld(context: Layer, entity: Entity): LuaEntity | nil {
  const worldPos = Pos.plus(entity.position, context.bbox.left_top)
  const candidates = context.surface.find_entities_filtered({
    position: worldPos,
    radius: 0,
    force: "player",
    name: entity.name,
    direction: entity.direction ?? 0,
    limit: 1,
  })
  return candidates[0]
}

/**
 * Creates the entity in the world.
 *
 * If an existing compatible entity is found, it is updated to match the given entity's properties, and that entity is
 * returned.
 */
export function createEntityInWorld(context: Layer, entity: AssemblyEntity): LuaEntity | nil {
  if (entity.layerNumber > context.layerNumber) return nil
  const { name, position, direction } = entity
  const existing = findCompatibleEntityInWorld(context, entity)
  if (existing) {
    matchExistingToEntity(existing, entity)
    return existing
  }
  return context.surface.create_entity({
    name,
    position: Pos.plus(position, context.bbox.left_top),
    direction,
    force: "player",
  })
}

function matchExistingToEntity(existing: LuaEntity, entity: AssemblyEntity): void {
  // right now, compatible entities must have same properties, so no updates are needed
  // in the future when more properties are supported, this will need to be updated
  assert(existing.name === entity.name)
  if (existing.supports_direction) assert(existing.direction === entity.direction)
}

export function deleteEntityInWorld(context: Layer, entity: AssemblyEntity): void {
  findCompatibleEntityInWorld(context, entity)?.destroy()
}

export function placeAssemblyInWorld(context: Layer, content: AssemblyContent): LuaEntity[] {
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

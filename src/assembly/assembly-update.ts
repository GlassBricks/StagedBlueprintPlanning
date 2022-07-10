import { AssemblyEntity, Entity, LayerNumber } from "../entity/AssemblyEntity"
import { BBox, Pos } from "../lib/geometry"
import { Layer } from "./Assembly"
import { AssemblyContent, MutableAssemblyContent } from "./AssemblyContent"

export type AssemblyUpdateType =
  | "created"
  | "refreshed"
  | "created-below"
  | "deleted"
  | "deleted-with-references"
  | "deletion-forbidden"
// | "updated"
// | "updated-above"

export type AssemblyUpdateHandler = (
  this: void,
  type: AssemblyUpdateType,
  entity: AssemblyEntity,
  layer: LayerNumber,
) => void

/** If a lua entity is considered to be an assembly entity. */
export function isAssemblyEntity(entity: LuaEntity): boolean {
  return entity.type !== "entity-ghost" && entity.has_flag("player-creation")
}

/**
 * When an entity is added from the world.
 * Does not check isAssemblyEntity.
 */
export function onEntityAdded(
  entity: LuaEntity,
  layer: Layer,
  content: MutableAssemblyContent,
  updateHandler: AssemblyUpdateHandler,
): void {
  const position = Pos.minus(entity.position, layer.bbox.left_top)
  assert(BBox.contains(layer.bbox, position), "entity outside of layer")
  const layerNumber = layer.layerNumber
  const added = content.add({
    name: entity.name,
    position,
    direction: entity.supports_direction ? entity.direction : nil,
    layerNumber,
  })
  updateHandler("created", added, layerNumber)
}

export function entityDeleted(layer: Layer, content: MutableAssemblyContent, entity: LuaEntity): void {
  if (!isAssemblyEntity(entity)) return
  const position = Pos.minus(entity.position, layer.bbox.left_top)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  const compatible = content.findCompatible(entity, position)
  if (compatible) {
    content.remove(compatible)
  }
}

export function findCompatibleEntityInWorld(layer: Layer, entity: Entity): LuaEntity | nil {
  const worldPos = Pos.plus(entity.position, layer.bbox.left_top)
  const candidates = layer.surface.find_entities_filtered({
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
export function createEntityInWorld(layer: Layer, entity: AssemblyEntity): LuaEntity | nil {
  if (entity.layerNumber > layer.layerNumber) return nil
  const { name, position, direction } = entity
  const existing = findCompatibleEntityInWorld(layer, entity)
  if (existing) {
    matchExistingToEntity(existing, entity)
    return existing
  }
  return layer.surface.create_entity({
    name,
    position: Pos.plus(position, layer.bbox.left_top),
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

export function deleteEntityInWorld(layer: Layer, entity: AssemblyEntity): void {
  findCompatibleEntityInWorld(layer, entity)?.destroy()
}

export function placeAssemblyInWorld(layer: Layer, content: AssemblyContent): LuaEntity[] {
  const result: LuaEntity[] = []
  for (const [, byX] of pairs(content.entities)) {
    for (const [, entities] of pairs(byX))
      for (const entity of entities) {
        const luaEntity = createEntityInWorld(layer, entity)
        if (luaEntity) result.push(luaEntity)
      }
  }
  return result
}

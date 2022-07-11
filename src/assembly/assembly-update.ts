import { AssemblyEntity, LayerNumber } from "../entity/AssemblyEntity"
import { BBox, Pos } from "../lib/geometry"
import { Layer } from "./Assembly"
import { MutableAssemblyContent } from "./AssemblyContent"

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
): AssemblyEntity {
  const position = Pos.minus(entity.position, layer.bbox.left_top)
  assert(BBox.contains(layer.bbox, position), "entity outside of layer")

  // search for existing entity
  const existing = content.findCompatible(entity, position)
  if (existing) {
    updateHandler("refreshed", existing, layer.layerNumber)
    return existing
  }

  const layerNumber = layer.layerNumber
  const added = content.add({
    name: entity.name,
    position,
    direction: entity.supports_direction ? entity.direction : nil,
    layerNumber,
  })
  updateHandler("created", added, layerNumber)
  return added
}

export function entityDeleted(
  entity: LuaEntity,
  layer: Layer,
  content: MutableAssemblyContent,
  updateHandler: AssemblyUpdateHandler,
): void {
  const position = Pos.minus(entity.position, layer.bbox.left_top)
  assert(position.x >= 0 && position.y >= 0, "entity position must be >= 0")
  const compatible = content.findCompatible(entity, position)
  if (!compatible) return
  if (compatible.layerNumber !== layer.layerNumber) {
    updateHandler("deletion-forbidden", compatible, layer.layerNumber)
    return
  }
  content.remove(compatible)
  updateHandler("deleted", compatible, layer.layerNumber)
}

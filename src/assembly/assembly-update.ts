import { AssemblyEntity, Entity, LayerChanges, LayerNumber, MutableAssemblyEntity } from "../entity/AssemblyEntity"
import { getEntityDiff, getLayerPosition, saveEntity } from "../entity/diff"
import { Pos } from "../lib/geometry"
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
  layer?: LayerNumber,
) => void

/** If a lua entity is considered to be an assembly entity. */
export function isAssemblyEntity(entity: LuaEntity): boolean {
  return entity.type !== "entity-ghost" && entity.has_flag("player-creation")
}

/**
 * When an entity is added from the world.
 * Does not check isAssemblyEntity.
 */
export function onEntityAdded<E extends Entity = Entity>(
  entity: LuaEntity,
  layer: Layer,
  content: MutableAssemblyContent,
  updateHandler: AssemblyUpdateHandler,
): AssemblyEntity<E> | nil
export function onEntityAdded(
  entity: LuaEntity,
  layer: Layer,
  content: MutableAssemblyContent,
  updateHandler: AssemblyUpdateHandler,
): AssemblyEntity | nil {
  const position = getLayerPosition(entity, layer)

  // search for existing entity
  const existing = content.findCompatible(entity, position)
  if (existing && existing.layerNumber <= layer.layerNumber) {
    updateHandler("refreshed", existing, layer.layerNumber)
    return existing
  }

  const added = saveEntity(entity, layer, position)
  if (existing) {
    return entityAddedBelow(added!, existing, content, updateHandler)
  }

  if (!added) return
  content.add(added)
  updateHandler("created", added)
  return added
}

function entityAddedBelow(
  below: MutableAssemblyEntity,
  existing: AssemblyEntity,
  content: MutableAssemblyContent,
  updateHandler: AssemblyUpdateHandler,
): AssemblyEntity {
  assert(below.layerNumber < existing.layerNumber)
  const diff = getEntityDiff(below, existing)
  if (diff) {
    const layerChanges: LayerChanges = (below.layerChanges = existing.layerChanges ?? {})
    assert(layerChanges[existing.layerNumber] === nil)
    layerChanges[existing.layerNumber] = diff
  }
  content.remove(existing)
  content.add(below)
  updateHandler("created-below", below, existing.layerNumber)
  return below
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

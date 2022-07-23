import {
  applyDiffToDiff,
  AssemblyEntity,
  createAssemblyEntity,
  Entity,
  getEntityDiff,
  getValueAtLayer,
  LayerChanges,
  LayerDiff,
  LayerNumber,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { getLayerPosition, saveEntity } from "../entity/diff"
import { nilIfEmpty } from "../lib"
import { LayerPosition } from "./Assembly"
import { MutableEntityMap } from "./EntityMap"
import { WorldUpdater, WorldUpdaterParams } from "./WorldUpdater"

export interface AssemblyUpdaterParams extends WorldUpdaterParams {
  readonly content: MutableEntityMap
}

/** @noSelf */
export interface AssemblyUpdater {
  onEntityCreated<E extends Entity = Entity>(
    assembly: AssemblyUpdaterParams,
    entity: LuaEntity,
    layer: LayerPosition,
  ): AssemblyEntity<E> | nil
  onEntityDeleted(assembly: AssemblyUpdaterParams, entity: LuaEntity, layer: LayerPosition): void
  onEntityPotentiallyUpdated(assembly: AssemblyUpdaterParams, entity: LuaEntity, layer: LayerPosition): void
}

function onEntityAdded<E extends Entity = Entity>(
  assembly: AssemblyUpdaterParams,
  entity: LuaEntity,
  layer: LayerPosition,
): AssemblyEntity<E> | nil
function onEntityAdded(assembly: AssemblyUpdaterParams, entity: LuaEntity, layer: LayerPosition): AssemblyEntity | nil {
  const position = getLayerPosition(entity, layer)
  const { layerNumber } = layer
  const { content } = assembly

  const existing = content.findCompatible(entity, position, entity.direction)
  if (existing && existing.layerNumber <= layerNumber) {
    entityAddedAbove(assembly, existing, layerNumber, entity)
    return existing
  }

  const saved = saveEntity(entity)
  if (existing) {
    // layerNumber < existing.layerNumber
    entityAddedBelow(assembly, existing, layerNumber, saved!)
    return existing
  }

  if (!saved) return

  const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, layerNumber)
  content.add(assemblyEntity)
  WorldUpdater.add(assembly, assemblyEntity, nil)
  return assemblyEntity
}

function entityAddedAbove(
  assembly: AssemblyUpdaterParams,
  existing: MutableAssemblyEntity,
  layerNumber: LayerNumber,
  entity: LuaEntity,
): void {
  if (existing.isLostReference) {
    reviveLostReference(assembly, existing, layerNumber)
  } else {
    WorldUpdater.refresh(assembly, existing, layerNumber, entity)
  }
}

function reviveLostReference(
  assembly: AssemblyUpdaterParams,
  existing: MutableAssemblyEntity,
  layerNumber: LayerNumber,
): void {
  // assert(layerNumber >= existing.layerNumber)
  // assert(existing.isLostReference)
  existing.baseEntity = getValueAtLayer(existing, layerNumber)!
  existing.isLostReference = nil
  existing.layerNumber = layerNumber
  const { layerChanges } = existing
  existing.layerChanges = layerChanges && getWithDeletedLayerChanges(existing.layerChanges, layerNumber)
  WorldUpdater.revive(assembly, existing)
}

function getWithDeletedLayerChanges(layerChanges: LayerChanges | nil, layerNumber: LayerNumber): LayerDiff | nil {
  if (!layerChanges) return nil
  for (const [layer] of pairs(layerChanges)) {
    if (layer > layerNumber) break
    delete layerChanges[layer]
  }
  return nilIfEmpty(layerChanges)
}

function entityAddedBelow(
  assembly: AssemblyUpdaterParams,
  existing: MutableAssemblyEntity,
  layerNumber: LayerNumber,
  added: Entity,
): void {
  // assert(layerNumber < existing.layerNumber)
  const diff = getEntityDiff(added, existing.baseEntity)
  const oldLayerNumber = existing.layerNumber
  if (diff) {
    const layerChanges: LayerChanges = (existing.layerChanges ??= {})
    assert(layerChanges[oldLayerNumber] === nil)
    layerChanges[oldLayerNumber] = diff
  }
  existing.layerNumber = layerNumber
  existing.baseEntity = added
  if (existing.isLostReference) {
    existing.isLostReference = nil
    WorldUpdater.revive(assembly, existing)
  } else {
    WorldUpdater.add(assembly, existing, oldLayerNumber)
  }
}

function onEntityDeleted(assembly: AssemblyUpdaterParams, entity: LuaEntity, layer: LayerPosition): void {
  const position = getLayerPosition(entity, layer)
  const { content } = assembly

  const compatible = content.findCompatible(entity, position, entity.direction)
  if (!compatible) return
  const { layerNumber } = layer

  if (compatible.layerNumber !== layerNumber) {
    if (compatible.layerNumber < layerNumber) {
      WorldUpdater.deletionForbidden(assembly, compatible, layerNumber)
    }
    // else: layerNumber > compatible.layerNumber; is bug, ignore
    return
  }

  if (compatible.layerChanges) {
    compatible.isLostReference = true
  } else {
    content.remove(compatible)
  }
  WorldUpdater.delete(assembly, compatible)
}

function onEntityPotentiallyUpdated(assembly: AssemblyUpdaterParams, entity: LuaEntity, layer: LayerPosition): void {
  const position = getLayerPosition(entity, layer)
  const { content } = assembly
  const { layerNumber } = layer

  const existing = content.findCompatible(entity, position, entity.direction)
  if (!existing || layerNumber < existing.layerNumber) {
    // bug, treat as add
    onEntityAdded(assembly, entity, layer)
    return
  }

  // get diff
  const newValue = saveEntity(entity)
  if (!newValue) return // bug?
  const valueAtLayer = getValueAtLayer(existing, layerNumber)!
  const diff = getEntityDiff(valueAtLayer, newValue)
  if (!diff) return // no change

  // apply update
  if (layerNumber === existing.layerNumber) {
    existing.baseEntity = newValue
  } else {
    // layerNumber > existing.layerNumber
    const layerChanges: LayerChanges = (existing.layerChanges ??= {})
    const existingDiff = layerChanges[layerNumber]
    if (existingDiff) {
      applyDiffToDiff(existingDiff, diff)
    } else {
      layerChanges[layerNumber] = diff
    }
  }
  WorldUpdater.update(assembly, existing, layerNumber)
}

export const AssemblyUpdater: AssemblyUpdater = {
  onEntityCreated: onEntityAdded,
  onEntityDeleted,
  onEntityPotentiallyUpdated,
}

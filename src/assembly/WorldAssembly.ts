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
import { nilIfEmpty, RegisterClass } from "../lib"
import { Layer } from "./Assembly"
import { MutableEntityMap, newEntityMap } from "./EntityMap"
import { WorldUpdater } from "./WorldUpdater"

@RegisterClass("WorldAssembly")
export class WorldAssembly {
  readonly content: MutableEntityMap = newEntityMap()

  constructor(private worldUpdater: WorldUpdater) {}

  onEntityAdded<E extends Entity = Entity>(entity: LuaEntity, layer: Layer): AssemblyEntity<E> | nil
  onEntityAdded(entity: LuaEntity, layer: Layer): AssemblyEntity | nil {
    const position = getLayerPosition(entity, layer)
    const { layerNumber } = layer
    const { content } = this

    const existing = content.findCompatible(entity, position, entity.direction)
    if (existing && existing.layerNumber <= layerNumber) {
      this.entityAddedAbove(existing, layerNumber, entity)
      return existing
    }

    const saved = saveEntity(entity)
    if (existing) {
      // layerNumber < existing.layerNumber
      this.entityAddedBelow(existing, layerNumber, saved!)
      return existing
    }

    if (!saved) return

    const assemblyEntity = createAssemblyEntity(saved, position, entity.direction, layerNumber)
    content.add(assemblyEntity)
    this.worldUpdater.add(assemblyEntity, nil)
    return assemblyEntity
  }

  private entityAddedAbove(existing: MutableAssemblyEntity, layerNumber: LayerNumber, entity: LuaEntity): void {
    if (existing.isLostReference) {
      this.reviveLostReference(existing, layerNumber)
    } else {
      this.worldUpdater.refresh(existing, layerNumber, entity)
    }
  }

  private reviveLostReference(existing: MutableAssemblyEntity, layerNumber: LayerNumber): void {
    // assert(layerNumber >= existing.layerNumber)
    // assert(existing.isLostReference)
    existing.baseEntity = getValueAtLayer(existing, layerNumber)!
    existing.isLostReference = nil
    existing.layerNumber = layerNumber
    const { layerChanges } = existing
    existing.layerChanges = layerChanges && this.getWithDeletedLayerChanges(existing.layerChanges, layerNumber)
    this.worldUpdater.revive(existing)
  }

  private getWithDeletedLayerChanges(layerChanges: LayerChanges | nil, layerNumber: LayerNumber): LayerDiff | nil {
    if (!layerChanges) return nil
    for (const [layer] of pairs(layerChanges)) {
      if (layer > layerNumber) break
      delete layerChanges[layer]
    }
    return nilIfEmpty(layerChanges)
  }

  private entityAddedBelow(existing: MutableAssemblyEntity, layerNumber: LayerNumber, added: Entity): void {
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
      this.worldUpdater.revive(existing)
    } else {
      this.worldUpdater.add(existing, oldLayerNumber)
    }
  }

  onEntityDeleted(entity: LuaEntity, layer: Layer): void {
    const position = getLayerPosition(entity, layer)
    const { content } = this

    const compatible = content.findCompatible(entity, position, entity.direction)
    if (!compatible) return
    const { layerNumber } = layer

    if (compatible.layerNumber !== layerNumber) {
      if (compatible.layerNumber < layerNumber) {
        this.worldUpdater.deletionForbidden(compatible, layerNumber)
      }
      // else: layerNumber > compatible.layerNumber; is bug, ignore
      return
    }

    if (compatible.layerChanges) {
      compatible.isLostReference = true
    } else {
      content.remove(compatible)
    }
    this.worldUpdater.delete(compatible)
  }

  onEntityPotentiallyUpdated(entity: LuaEntity, layer: Layer): void {
    const position = getLayerPosition(entity, layer)
    const { content } = this
    const { layerNumber } = layer

    const existing = content.findCompatible(entity, position, entity.direction)
    if (!existing || layerNumber < existing.layerNumber) {
      // bug, treat as add
      this.onEntityAdded(entity, layer)
      return
    }
    const newValue = saveEntity(entity)
    if (!newValue) return // bug?
    const valueAtLayer = getValueAtLayer(existing, layerNumber)!
    const diff = getEntityDiff(valueAtLayer, newValue)
    if (!diff) return // no change

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
    this.worldUpdater.update(existing, layerNumber)
  }
}

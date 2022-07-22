import {
  applyDiffToEntity,
  AssemblyEntity,
  getValueAtLayer,
  LayerNumber,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { createEntity, matchEntity } from "../entity/diff"
import { mutableShallowCopy, RegisterClass } from "../lib"
import { AssemblyPositions, Layer } from "./Assembly"

export interface WorldUpdater {
  /** Either new, in which [stopAt] is nil, or added below, in which [stopAt] is the old layer number */
  add(entity: MutableAssemblyEntity, stopAt: LayerNumber | nil): void
  /** Must already exist in assembly */
  refresh(assemblyEntity: MutableAssemblyEntity, layer: LayerNumber, luaEntity: LuaEntity): void
  /** Tries to add the all entities to all layers, with their given values */
  revive(entity: MutableAssemblyEntity): void
  /** Must be at base layer */
  // todo: add "up to", for only deleting from lower layers
  delete(entity: MutableAssemblyEntity): void
  deletionForbidden(entity: MutableAssemblyEntity, layer: LayerNumber): void
  update(entity: MutableAssemblyEntity, layer: LayerNumber): void
}

@RegisterClass("WorldUpdater")
class WorldUpdaterImpl implements WorldUpdater {
  private readonly layers: Record<LayerNumber, Layer> & {
    length: LuaLengthMethod<number>
  }
  constructor(assembly: AssemblyPositions) {
    this.layers = assembly.layers as any
  }

  add(entity: MutableAssemblyEntity, stopAt: LayerNumber | nil): void {
    const { baseEntity, layerNumber, worldEntities } = entity
    const { layers } = this
    for (const curLayer of $range(layerNumber, stopAt ? stopAt - 1 : layers.length())) {
      if (curLayer === stopAt) break
      const layer = layers[curLayer]
      worldEntities[curLayer] = createEntity(layer, entity, baseEntity)
    }
  }
  refresh(entity: MutableAssemblyEntity, layer: LayerNumber, luaEntity: LuaEntity): void {
    const value = assert(getValueAtLayer(entity, layer))
    matchEntity(luaEntity, value)
    entity.worldEntities[layer] = luaEntity
  }
  revive(entity: MutableAssemblyEntity): void {
    const { layerChanges } = entity
    if (!layerChanges) {
      return this.add(entity, nil)
    }

    const { baseEntity, layerNumber, worldEntities } = entity
    const { layers } = this
    const curValue = mutableShallowCopy(baseEntity)
    for (const curLayer of $range(layerNumber, layers.length())) {
      if (curLayer !== layerNumber) {
        const changes = layerChanges[curLayer]
        if (changes) applyDiffToEntity(curValue, changes)
      }

      const layer = layers[curLayer]
      worldEntities[curLayer] = createEntity(layer, entity, curValue)
    }
  }
  delete(entity: MutableAssemblyEntity): void {
    const { worldEntities } = entity
    for (const [layer, luaEntity] of pairs(worldEntities)) {
      if (luaEntity.valid) luaEntity.destroy()
      worldEntities[layer] = nil
    }
  }
  deletionForbidden(entity: MutableAssemblyEntity, layerNumber: LayerNumber): void {
    const value = assert(getValueAtLayer(entity, layerNumber))
    const layer = this.layers[layerNumber]
    entity.worldEntities[layerNumber] = createEntity(layer, entity, value)
  }
  update(entity: AssemblyEntity, layerNumber: LayerNumber): void {
    const { worldEntities, layerChanges } = entity
    const { layers } = this
    const curValue = getValueAtLayer(entity, layerNumber)!
    for (const curLayer of $range(layerNumber, layers.length())) {
      if (curLayer !== layerNumber && layerChanges) {
        const changes = layerChanges[curLayer]
        if (changes) applyDiffToEntity(curValue, changes)
      }
      const worldEntity = worldEntities[curLayer]
      if (worldEntity && worldEntity.valid) {
        matchEntity(worldEntity, curValue)
      }
    }
  }
}

export function newWorldUpdater(assembly: AssemblyPositions): WorldUpdater {
  return new WorldUpdaterImpl(assembly)
}

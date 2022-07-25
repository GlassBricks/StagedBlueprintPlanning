import {
  applyDiffToEntity,
  AssemblyEntity,
  getValueAtLayer,
  LayerNumber,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { createEntity, matchEntity } from "../entity/diff"
import { mutableShallowCopy } from "../lib"
import { LayerPosition } from "./Assembly"

export interface WorldUpdaterParams {
  readonly layers: Record<number, LayerPosition>
}

/** @noSelf */
export interface WorldUpdater {
  /** Either new, in which [stopAt] is nil, or added below, in which [stopAt] is the old layer number */
  add(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, stopAt: LayerNumber | nil): void
  /** Must already exist in assembly */
  refresh(
    assembly: WorldUpdaterParams,
    assemblyEntity: MutableAssemblyEntity,
    layer: LayerNumber,
    luaEntity: LuaEntity,
  ): void
  /** Tries to add the all entities to all layers, with their given values */
  revive(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void
  /** Must be at base layer */
  // todo: add "up to", for only deleting from lower layers
  delete(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void
  deletionForbidden(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void
  update(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, layer: LayerNumber): void
}

declare const luaLength: LuaLength<Record<number, any>, number>

function add(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity, stopAt: LayerNumber | nil): void {
  const { baseEntity, layerNumber, worldEntities } = entity
  const { layers } = assembly
  for (const curLayer of $range(layerNumber, stopAt ? stopAt - 1 : luaLength(layers))) {
    if (curLayer === stopAt) break
    const layer = layers[curLayer]
    worldEntities[curLayer] = createEntity(layer, entity, baseEntity)
  }
}

function refresh(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  layer: LayerNumber,
  luaEntity: LuaEntity,
): void {
  const value = assert(getValueAtLayer(entity, layer))
  matchEntity(luaEntity, value)
  entity.worldEntities[layer] = luaEntity
}

function revive(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void {
  const { layerChanges } = entity
  if (!layerChanges) {
    return add(assembly, entity, nil)
  }

  const { baseEntity, layerNumber, worldEntities } = entity
  const { layers } = assembly
  const curValue = mutableShallowCopy(baseEntity)
  for (const curLayer of $range(layerNumber, luaLength(layers))) {
    if (curLayer !== layerNumber) {
      const changes = layerChanges[curLayer]
      if (changes) applyDiffToEntity(curValue, changes)
    }

    const layer = layers[curLayer]
    worldEntities[curLayer] = createEntity(layer, entity, curValue)
  }
}

function _delete(assembly: WorldUpdaterParams, entity: MutableAssemblyEntity): void {
  const { worldEntities } = entity
  for (const [layer, luaEntity] of pairs(worldEntities)) {
    if (luaEntity.valid) luaEntity.destroy()
    worldEntities[layer] = nil
  }
}

function deletionForbidden(
  assembly: WorldUpdaterParams,
  entity: MutableAssemblyEntity,
  layerNumber: LayerNumber,
): void {
  const value = assert(getValueAtLayer(entity, layerNumber))
  const layer = assembly.layers[layerNumber]
  const { worldEntities } = entity
  worldEntities[layerNumber]?.destroy()
  entity.worldEntities[layerNumber] = createEntity(layer, entity, value)
}
function update(assembly: WorldUpdaterParams, entity: AssemblyEntity, layerNumber: LayerNumber): void {
  const { worldEntities, layerChanges } = entity
  const { layers } = assembly
  const curValue = getValueAtLayer(entity, layerNumber)!
  for (const curLayer of $range(layerNumber, luaLength(layers))) {
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

export const WorldUpdater: WorldUpdater = {
  add,
  refresh,
  revive,
  delete: _delete,
  deletionForbidden,
  update,
}

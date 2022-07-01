import { RegisterClass } from "../lib"
import { Map2D, map2dGet, MutableMap2D } from "../lib/map2d"
import { Entity, LayerEntity, MutableLayerEntity } from "./entity"

export interface LayerContent {
  readonly entities: Map2D<LayerEntity>

  findCompatible(entity: Entity): Entity | nil
}

export interface MutableLayerContent extends LayerContent {
  readonly entities: MutableMap2D<MutableLayerEntity>
}

@RegisterClass("LayerContent")
class LayerContentImpl implements MutableLayerContent {
  readonly entities: MutableMap2D<MutableLayerEntity> = {}

  findCompatible(entity: Entity): Entity | nil {
    const { x, y } = entity.position
    const atPos = map2dGet(this.entities, x, y)
    if (!atPos) return
    for (const candidate of atPos) {
      if (candidate.name === entity.name && candidate.direction === entity.direction) {
        return candidate
      }
    }
  }
}

export function layerContent(): MutableLayerContent {
  return new LayerContentImpl()
}

import {
  AssemblyEntity,
  Entity,
  getCategoryName,
  isCompatibleEntity,
  MutableAssemblyEntity,
} from "../entity/AssemblyEntity"
import { RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { Map2D, map2dAdd, map2dGet, map2dRemove, MutableMap2D } from "../lib/map2d"

export interface EntityMap {
  readonly entities: Map2D<AssemblyEntity>

  findCompatible(entity: Entity, position: Position, direction: defines.direction | nil): AssemblyEntity | nil
}

export interface MutableEntityMap extends EntityMap {
  readonly entities: MutableMap2D<MutableAssemblyEntity>

  findCompatible(entity: Entity, position: Position, direction: defines.direction | nil): MutableAssemblyEntity | nil

  add<E extends Entity = Entity>(entity: MutableAssemblyEntity<E>): void
  remove<E extends Entity = Entity>(entity: MutableAssemblyEntity<E>): void
}

@RegisterClass("EntityMap")
class EntityMapImpl implements MutableEntityMap {
  readonly entities: MutableMap2D<MutableAssemblyEntity> = {}

  findCompatible(entity: Entity, position: Position, direction: defines.direction | nil): AssemblyEntity | nil {
    const { x, y } = position
    const atPos = map2dGet(this.entities, x, y)
    if (!atPos) return
    const categoryName = getCategoryName(entity)
    if (direction === 0) direction = nil
    for (const candidate of atPos) {
      if (isCompatibleEntity(candidate, categoryName, direction)) return candidate
    }
  }

  add<E extends Entity = Entity>(entity: MutableAssemblyEntity<E>): void {
    const { x, y } = entity.position
    map2dAdd(this.entities, x, y, entity)
  }

  remove<E extends Entity = Entity>(entity: MutableAssemblyEntity<E>): void {
    const { x, y } = entity.position
    map2dRemove(this.entities, x, y, entity)
  }
}

export function newEntityMap(): MutableEntityMap {
  return new EntityMapImpl()
}

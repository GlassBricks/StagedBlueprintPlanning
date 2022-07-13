import { AssemblyEntity, Entity, isCompatibleEntity, MutableAssemblyEntity } from "../entity/AssemblyEntity"
import { RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { Map2D, map2dAdd, map2dGet, map2dRemove, MutableMap2D } from "../lib/map2d"

export interface AssemblyContent {
  readonly entities: Map2D<AssemblyEntity>

  findCompatible(entity: Entity, position?: Position): AssemblyEntity | nil
}

export interface MutableAssemblyContent extends AssemblyContent {
  readonly entities: MutableMap2D<MutableAssemblyEntity>

  findCompatible(entity: Entity, position?: Position): MutableAssemblyEntity | nil

  add<E extends Entity = Entity>(entity: MutableAssemblyEntity<E>): void
  remove<E extends Entity = Entity>(entity: MutableAssemblyEntity<E>): void
}

@RegisterClass("AssemblyContent")
class AssemblyContentImpl implements MutableAssemblyContent {
  readonly entities: MutableMap2D<MutableAssemblyEntity> = {}

  findCompatible(entity: Entity, position?: Position): AssemblyEntity<any> | nil {
    const { x, y } = position ?? entity.position
    const atPos = map2dGet(this.entities, x, y)
    if (!atPos) return
    for (const candidate of atPos) {
      if (isCompatibleEntity(candidate, entity)) return candidate
    }
  }

  add(entity: MutableAssemblyEntity): void {
    const { x, y } = entity.position
    map2dAdd(this.entities, x, y, entity)
  }

  remove(entity: MutableAssemblyEntity): void {
    const { x, y } = entity.position
    map2dRemove(this.entities, x, y, entity)
  }
}

export function newAssemblyContent(): MutableAssemblyContent {
  return new AssemblyContentImpl()
}

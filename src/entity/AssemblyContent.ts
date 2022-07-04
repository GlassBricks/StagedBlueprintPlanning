import { RegisterClass } from "../lib"
import { Map2D, map2dAdd, map2dGet, MutableMap2D } from "../lib/map2d"
import { AssemblyEntity, Entity, MutableAssemblyEntity } from "./AssemblyEntity"

export interface AssemblyContent {
  readonly entities: Map2D<AssemblyEntity>

  findCompatible<T extends Entity>(entity: T): AssemblyEntity<T> | nil
}

export interface MutableAssemblyContent extends AssemblyContent {
  readonly entities: MutableMap2D<MutableAssemblyEntity>

  add(entity: Entity): void
}

@RegisterClass("AssemblyContent")
class AssemblyContentImpl implements MutableAssemblyContent {
  readonly entities: MutableMap2D<MutableAssemblyEntity> = {}

  findCompatible(entity: Entity): AssemblyEntity<any> | nil {
    const { x, y } = entity.position
    const atPos = map2dGet(this.entities, x, y)
    if (!atPos) return
    for (const candidate of atPos) {
      if (candidate.name === entity.name && candidate.direction === entity.direction) {
        return candidate
      }
    }
  }

  add(entity: Entity): void {
    const { x, y } = entity.position
    map2dAdd(this.entities, x, y, entity)
  }
}

export function newAssemblyContent(): MutableAssemblyContent {
  return new AssemblyContentImpl()
}

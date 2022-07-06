import { RegisterClass } from "../lib"
import { Position } from "../lib/geometry"
import { Map2D, map2dAdd, map2dGet, map2dRemove, MutableMap2D } from "../lib/map2d"
import { AssemblyEntity, Entity, MutableAssemblyEntity } from "./AssemblyEntity"

export interface AssemblyContent {
  readonly entities: Map2D<AssemblyEntity>

  findCompatible<T extends Entity>(entity: T, position?: Position): MutableAssemblyEntity<T> | nil
}

export interface MutableAssemblyContent extends AssemblyContent {
  readonly entities: MutableMap2D<MutableAssemblyEntity>

  add(entity: MutableAssemblyEntity): void
  remove(existingEntity: MutableAssemblyEntity): void
}

/** Does not check position */
export function isCompatibleEntity(a: Entity, b: Entity): boolean {
  return a.name === b.name && (a.direction ?? 0) === (b.direction ?? 0)
}

@RegisterClass("AssemblyContent")
class AssemblyContentImpl implements MutableAssemblyContent {
  readonly entities: MutableMap2D<MutableAssemblyEntity> = {}

  findCompatible(entity: Entity, position?: Position): AssemblyEntity<any> | nil {
    const { x, y } = position ?? entity.position
    const atPos = map2dGet(this.entities, x, y)
    if (!atPos) return
    for (const candidate of atPos) {
      if (candidate.name === entity.name && (candidate.direction ?? 0) === (entity.direction ?? 0)) {
        return candidate
      }
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

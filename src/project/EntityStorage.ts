import { LuaEntity } from "factorio:runtime"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { RegisterClass } from "../lib"

const raise_destroy = script.raise_script_destroy

/** @noSelf */
interface StoredEntity {
  readonly object_name: string
  readonly valid: boolean
  destroy(): void
}

@RegisterClass("EntityStorage")
export class EntityStorage<T extends { [K in keyof T]: StoredEntity }> {
  private data = new LuaMap<ProjectEntity, LuaMap<keyof T, LuaMap<StageNumber, unknown>>>()

  get<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): T[K] | nil {
    const value = this.data.get(entity)?.get(type)?.get(stage) as T[K] | nil
    if (value == nil) return nil
    if (value.valid) return value
    this.rawDelete(entity, type, stage)
    return nil
  }

  set<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber, value: T[K] | nil): void {
    if (value == nil) {
      this.delete(entity, type, stage)
      return
    }
    let byEntity = this.data.get(entity)
    if (!byEntity) {
      byEntity = new LuaMap()
      this.data.set(entity, byEntity)
    }
    let byType = byEntity.get(type)
    if (!byType) {
      byType = new LuaMap()
      byEntity.set(type, byType)
    }
    const existing = byType.get(stage) as T[K] | nil
    if (existing != nil && existing != value) this.destroyIfValid(existing)
    byType.set(stage, value)
  }

  delete<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): void {
    const byType = this.data.get(entity)?.get(type)
    if (!byType) return
    this.destroyEntry(byType, stage)
    this.cleanupType(entity, type, byType)
  }

  deleteAllOfType<K extends keyof T & string>(entity: ProjectEntity, type: K): void {
    const byEntity = this.data.get(entity)
    if (!byEntity) return
    const byType = byEntity.get(type)
    if (byType) this.destroyAllEntries(byType)
    byEntity.delete(type)
    if (byEntity.isEmpty()) this.data.delete(entity)
  }

  deleteAllForEntity(entity: ProjectEntity): void {
    const byEntity = this.data.get(entity)
    if (byEntity) {
      for (const [, byType] of byEntity) this.destroyAllEntries(byType)
    }
    this.data.delete(entity)
  }

  iterateType<K extends keyof T & string>(entity: ProjectEntity, type: K): LuaPairsIterable<StageNumber, T[K]> {
    const byType = this.data.get(entity)?.get(type)
    if (!byType) return new LuaMap()
    const result = new LuaMap<StageNumber, T[K]>()
    for (const [stage, value] of byType) {
      const typed = value as T[K]
      if (typed.valid) {
        result.set(stage, typed)
      } else {
        byType.delete(stage)
      }
    }
    this.cleanupType(entity, type, byType)
    return result
  }

  shiftStageKeysUp(entity: ProjectEntity, fromStage: StageNumber): void {
    const byEntity = this.data.get(entity)
    if (!byEntity) return
    for (const [, byType] of byEntity) {
      shiftLuaMapKeysUp(byType, fromStage)
    }
  }

  shiftStageKeysDown(entity: ProjectEntity, fromStage: StageNumber): void {
    const byEntity = this.data.get(entity)
    if (!byEntity) return
    for (const [, byType] of byEntity) {
      this.destroyEntry(byType, fromStage)
      shiftLuaMapKeysDown(byType, fromStage)
    }
  }

  private rawDelete(entity: ProjectEntity, type: keyof T, stage: StageNumber): void {
    const byType = this.data.get(entity)?.get(type)
    if (!byType) return
    byType.delete(stage)
    this.cleanupType(entity, type, byType)
  }

  private destroyIfValid(entry: StoredEntity): void {
    if (!entry.valid) return
    if (entry.object_name == "LuaEntity") raise_destroy({ entity: entry as LuaEntity })
    entry.destroy()
  }

  private destroyEntry(byType: LuaMap<StageNumber, unknown>, stage: StageNumber): void {
    const existing = byType.get(stage) as StoredEntity | nil
    if (existing != nil) this.destroyIfValid(existing)
    byType.delete(stage)
  }

  private destroyAllEntries(byType: LuaMap<StageNumber, unknown>): void {
    for (const [, entry] of byType) this.destroyIfValid(entry as StoredEntity)
  }

  private cleanupType(entity: ProjectEntity, type: keyof T, byType: LuaMap<StageNumber, unknown>): void {
    if (!byType.isEmpty()) return
    const byEntity = this.data.get(entity)!
    byEntity.delete(type)
    if (byEntity.isEmpty()) this.data.delete(entity)
  }
}

function shiftLuaMapKeysUp(map: LuaMap<StageNumber, unknown>, fromStage: StageNumber): void {
  const keysToShift: StageNumber[] = []
  for (const [stage] of map) {
    if (stage >= fromStage) keysToShift.push(stage)
  }
  for (let i = keysToShift.length - 1; i >= 0; i--) {
    const key = keysToShift[i]
    map.set(key + 1, map.get(key))
    map.delete(key)
  }
}

function shiftLuaMapKeysDown(map: LuaMap<StageNumber, unknown>, fromStage: StageNumber): void {
  const keysToShift: StageNumber[] = []
  for (const [stage] of map) {
    if (stage > fromStage) keysToShift.push(stage)
  }
  keysToShift.sort((a, b) => a - b)
  for (const key of keysToShift) {
    map.set(key - 1, map.get(key))
    map.delete(key)
  }
}

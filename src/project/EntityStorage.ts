import { nil } from "factorio:runtime"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { RegisterClass } from "../lib"

@RegisterClass("EntityStorage")
export class EntityStorage<T extends Record<string, unknown>> {
  private data = new LuaMap<ProjectEntity, LuaMap<keyof T, LuaMap<StageNumber, unknown>>>()

  get<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): T[K] | nil {
    return this.data.get(entity)?.get(type)?.get(stage) as T[K] | nil
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
    byType.set(stage, value)
  }

  delete<K extends keyof T & string>(entity: ProjectEntity, type: K, stage: StageNumber): void {
    const byType = this.data.get(entity)?.get(type)
    if (!byType) return
    byType.delete(stage)
    this.cleanupType(entity, type, byType)
  }

  deleteAllOfType<K extends keyof T & string>(entity: ProjectEntity, type: K): void {
    const byEntity = this.data.get(entity)
    if (!byEntity) return
    byEntity.delete(type)
    if (byEntity.isEmpty()) this.data.delete(entity)
  }

  deleteAllForEntity(entity: ProjectEntity): void {
    this.data.delete(entity)
  }

  iterateType<K extends keyof T & string>(entity: ProjectEntity, type: K): LuaPairsIterable<StageNumber, T[K]> {
    const byType = this.data.get(entity)?.get(type)
    if (!byType) return new LuaMap()
    return byType
  }

  hasAnyOfType<K extends keyof T & string>(entity: ProjectEntity, type: K): boolean {
    const byType = this.data.get(entity)?.get(type)
    return byType != nil && !byType.isEmpty()
  }

  hasInRange<K extends keyof T & string>(
    entity: ProjectEntity,
    type: K,
    start: StageNumber,
    end: StageNumber,
  ): boolean {
    const byType = this.data.get(entity)?.get(type)
    if (!byType) return false
    for (const [stage] of byType) {
      if (stage >= start && stage <= end) return true
    }
    return false
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
      shiftLuaMapKeysDown(byType, fromStage)
    }
  }

  private cleanupType(entity: ProjectEntity, type: string, byType: LuaMap<StageNumber, unknown>): void {
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
  map.delete(fromStage)
  keysToShift.sort((a, b) => a - b)
  for (const key of keysToShift) {
    map.set(key - 1, map.get(key))
    map.delete(key)
  }
}

/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { StagePosition } from "../../assembly/AssemblyContent"
import { StageNumber } from "../../entity/AssemblyEntity"
import { Entity, EntityPose } from "../../entity/Entity"
import { DefaultEntityHandler, EntityCreator, EntitySaver } from "../../entity/EntityHandler"
import { MutableMap2D, newMap2D, shallowCopy } from "../../lib"
import { Position } from "../../lib/geometry"
import { BuiltinEntityKeys, entityMock, isMock } from "../simple-mock"

/** @noSelf */
export interface MockEntityCreator extends EntityCreator {
  getAt(stage: StageNumber, position?: Position): MockEntityEntry | nil
}

export interface MockEntityEntry {
  value: Entity
  luaEntity: LuaEntity
  stage: StageNumber
}

export function createMockEntityCreator(): MockEntityCreator {
  const values: Record<StageNumber, MutableMap2D<MockEntityEntry>> = {}
  const luaEntityToEntry = new LuaMap<LuaEntity, MockEntityEntry>()

  function getAt(stage: StageNumber, position?: Position): MockEntityEntry | nil {
    const stageValues = values[stage]
    if (stageValues === nil) return nil
    if (position === nil) {
      for (const [, byX] of stageValues) {
        for (const [, byY] of pairs(byX)) {
          for (const entry of byY) {
            if (entry.luaEntity.valid) return entry
          }
        }
      }
      return nil
    }
    const atPos = stageValues.get(position.x, position.y)
    if (!atPos) return nil
    for (const entry of atPos) {
      if (entry.luaEntity.valid) return entry
    }
  }

  function createEntity(stage: number, value: Entity, direction: defines.direction, position: MapPosition): LuaEntity {
    const byStage = values[stage] ?? (values[stage] = newMap2D())

    const luaEntity = entityMock({
      ...value,
      direction,
      position,
    })

    const entry: MockEntityEntry = {
      value: shallowCopy(value),
      luaEntity,
      stage,
    }
    byStage.add(position.x, position.y, entry)
    luaEntityToEntry.set(luaEntity, entry)
    return luaEntity
  }
  return {
    createEntity(stagePos: StagePosition, { position, direction }: EntityPose, value: Entity): LuaEntity | nil {
      const stage = stagePos.stageNumber
      if (getAt(stage, position) !== nil) return nil // overlapping entity
      return createEntity(stage, value, direction ?? 0, position)
    },
    updateEntity(luaEntity: LuaEntity, value: Entity, direction): LuaEntity {
      assert(luaEntity.valid)
      const entry = luaEntityToEntry.get(luaEntity)
      if (entry) {
        const { value: oldValue, stage } = entry
        if (oldValue.name !== value.name) {
          // simulate fast replace
          luaEntityToEntry.delete(luaEntity)
          luaEntity.destroy()
          values[entry.stage].delete(luaEntity.position.x, luaEntity.position.y, entry)
          return createEntity(stage, value, direction, luaEntity.position)
        }
        entry.value = shallowCopy(value)
      }
      luaEntity.direction = direction
      return luaEntity
    },
    getAt,
  }
}

const excludedKeys = newLuaSet("valid", "object_name", "position", "direction")
for (const key of keys<BuiltinEntityKeys>()) excludedKeys.add(key)
export function createMockEntitySaver(): EntitySaver {
  return {
    saveEntity(entity: LuaEntity) {
      if (!isMock(entity)) return DefaultEntityHandler.saveEntity(entity)
      const result: any = {}
      for (const [key, value] of pairs(entity)) {
        if (typeof value !== "function" && !excludedKeys.has(key)) {
          result[key] = value
        }
      }
      return $multi(result, entity.direction ?? 0)
    },
  }
}

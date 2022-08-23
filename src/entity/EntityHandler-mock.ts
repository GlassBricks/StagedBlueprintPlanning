/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { keys } from "ts-transformer-keys"
import { StagePosition } from "../assembly/AssemblyContent"
import { shallowCopy } from "../lib"
import { Position } from "../lib/geometry"
import { MutableMap2D, newMap2D } from "../lib/map2d"
import { BuiltinEntityKeys, entityMock, isMock } from "../test/simple-mock"
import { StageNumber } from "./AssemblyEntity"
import { Entity, EntityPose } from "./Entity"
import { DefaultEntityHandler, EntityCreator, EntitySaver } from "./EntityHandler"

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

  function createEntity(
    stage: number,
    value: Entity,
    direction: defines.direction | undefined,
    position: MapPosition,
  ): LuaEntity {
    const byStage = values[stage] ?? (values[stage] = newMap2D())

    const luaEntity = entityMock({
      ...value,
      direction: direction ?? 0,
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
      return createEntity(stage, value, direction, position)
    },
    updateEntity(luaEntity: LuaEntity, value: Entity): LuaEntity {
      assert(luaEntity.valid)
      const entry = luaEntityToEntry.get(luaEntity)
      if (entry) {
        const { value: oldValue, stage } = entry
        if (oldValue.name !== value.name) {
          // simulate fast replace
          luaEntityToEntry.delete(luaEntity)
          luaEntity.destroy()
          values[entry.stage].delete(luaEntity.position.x, luaEntity.position.y, entry)
          return createEntity(stage, value, luaEntity.direction, luaEntity.position)
        }
        entry.value = shallowCopy(value)
      }
      return luaEntity
    },
    getAt,
  }
}

const excludedKeys = newLuaSet("valid", "object_name", "position", "direction")
for (const key of keys<BuiltinEntityKeys>()) excludedKeys.add(key)
export function createMockEntitySaver(): EntitySaver {
  return {
    saveEntity(entity: LuaEntity): Entity | nil {
      if (!isMock(entity)) return DefaultEntityHandler.saveEntity(entity)
      const result: any = {}
      for (const [key, value] of pairs(entity)) {
        if (typeof value !== "function" && !excludedKeys.has(key)) {
          result[key] = value
        }
      }
      return result
    },
  }
}

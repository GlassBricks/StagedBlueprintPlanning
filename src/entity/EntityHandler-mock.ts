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

import { LayerPosition } from "../assembly/Assembly"
import { shallowCopy } from "../lib"
import { Position } from "../lib/geometry"
import { MutableMap2D, newMap2D } from "../lib/map2d"
import { entityMock, isMock } from "../test-util/simple-mock"
import { LayerNumber } from "./AssemblyEntity"
import { Entity, EntityPose } from "./Entity"
import { EntityCreator, EntitySaver } from "./EntityHandler"

/** @noSelf */
export interface MockEntityCreator extends EntityCreator {
  getAt(layer: LayerNumber, position?: Position): MockEntityEntry | nil
}

export interface MockEntityEntry {
  value: Entity
  luaEntity: LuaEntity
}

export function createMockEntityCreator(): MockEntityCreator {
  const values: Record<LayerNumber, MutableMap2D<MockEntityEntry>> = {}
  const luaEntityToEntry = new LuaMap<LuaEntity, { value: Entity; luaEntity: LuaEntity }>()

  function getAt(layer: LayerNumber, position?: Position): MockEntityEntry | nil {
    const layerValues = values[layer]
    if (layerValues === nil) return nil
    if (position === nil) {
      for (const [, byX] of layerValues) {
        for (const [, byY] of pairs(byX)) {
          for (const entry of byY) {
            if (entry.luaEntity.valid) return entry
          }
        }
      }
      return nil
    }
    const atPos = layerValues.get(position.x, position.y)
    if (!atPos) return nil
    for (const entry of atPos) {
      if (entry.luaEntity.valid) return entry
    }
  }

  return {
    createEntity(layerPos: LayerPosition, { position, direction }: EntityPose, value: Entity): LuaEntity | nil {
      const layer = layerPos.layerNumber
      if (getAt(layer, position) !== nil) return nil // overlapping entity
      const byLayer = values[layer] ?? (values[layer] = newMap2D())

      const luaEntity = entityMock({
        ...value,
        direction: direction ?? 0,
        position,
      })

      const entry: MockEntityEntry = {
        value: shallowCopy(value),
        luaEntity,
      }
      byLayer.add(position.x, position.y, entry)
      luaEntityToEntry.set(luaEntity, entry)
      return luaEntity
    },
    updateEntity(luaEntity: LuaEntity, value: Entity): void {
      assert(luaEntity.valid)
      const entry = luaEntityToEntry.get(luaEntity)
      if (entry) entry.value = shallowCopy(value)
    },
    getAt,
  }
}

export function createMockEntitySaver(): EntitySaver {
  return {
    saveEntity(entity: LuaEntity): Entity | nil {
      assert(isMock(entity))
      const result: any = {}
      const excludedKeys = newLuaSet("valid", "object_name", "position", "direction")
      for (const [key, value] of pairs(entity)) {
        if (typeof value !== "function" && !excludedKeys.has(key)) {
          result[key] = value
        }
      }
      return result
    },
  }
}

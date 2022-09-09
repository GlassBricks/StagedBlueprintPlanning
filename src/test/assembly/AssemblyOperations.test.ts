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

import { AssemblyContent } from "../../assembly/AssemblyContent"
import {
  AssemblyOperations,
  AssemblyOpWorldInteractor,
  createAssemblyOperations,
} from "../../assembly/AssemblyOperations"
import { AssemblyUpdater } from "../../assembly/AssemblyUpdater"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import { createAssemblyEntity, RollingStockAssemblyEntity } from "../../entity/AssemblyEntity"
import { Pos } from "../../lib/geometry"
import { createRollingStocks } from "../entity/createRollingStock"
import { createMockAssemblyContent } from "./Assembly-mock"

let assembly: AssemblyContent

let assemblyUpdater: mock.Mocked<AssemblyUpdater>
let worldUpdater: mock.Mocked<WorldUpdater>
let worldInteractor: mock.Mocked<AssemblyOpWorldInteractor>

let operations: AssemblyOperations
before_each(() => {
  assembly = createMockAssemblyContent(3)
  worldUpdater = {
    updateWorldEntities: spy(),
    deleteAllEntities: spy(),
    forceDeleteEntity: spy(),
    deleteExtraEntitiesOnly: spy(),
    makeSettingsRemnant: spy(),
    reviveSettingsRemnant: spy(),
  }
  worldInteractor = {
    deleteAllWorldEntities: spy(),
  }
  assemblyUpdater = {
    onCircuitWiresPotentiallyUpdated: spy(),
    onCleanupToolUsed: spy(),
    onEntityCreated: spy(),
    onEntityDeleted: spy(),
    onEntityForceDeleted: spy(),
    onEntityMarkedForUpgrade: spy(),
    onEntityPotentiallyUpdated: spy(),
    onEntityRotated: spy(),
    onMoveEntityToStage: spy(),
    moveEntityToStage: spy(),
  }

  operations = createAssemblyOperations(assemblyUpdater, worldUpdater, worldInteractor)
})

test("deleteAllExtraEntitiesOnly", () => {
  const entity1 = createAssemblyEntity({ name: "test" }, Pos(0, 0), 0, 1)
  const entity2 = createAssemblyEntity({ name: "test2" }, Pos(0, 0), 0, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)

  operations.deleteAllExtraEntitiesOnly(assembly)
  assert.spy(worldUpdater.deleteExtraEntitiesOnly).called_with(match.ref(entity1))
  assert.spy(worldUpdater.deleteExtraEntitiesOnly).called_with(match.ref(entity2))
})

test("resetStage", () => {
  const entity1 = createAssemblyEntity({ name: "test" }, Pos(0, 0), 0, 1)
  const entity2 = createAssemblyEntity({ name: "test2" }, Pos(0, 0), 0, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)

  const stage = assembly.getStage(2)!
  operations.resetStage(assembly, stage)

  assert.spy(worldInteractor.deleteAllWorldEntities).called_with(match.ref(stage))

  assert.spy(worldUpdater.updateWorldEntities).called_with(match.ref(assembly), match.ref(entity1), 2, 2)
  assert.spy(worldUpdater.updateWorldEntities).called_with(match.ref(assembly), match.ref(entity2), 2, 2)
})

describe("trains", () => {
  let entities: LuaEntity[]
  let assemblyEntities: RollingStockAssemblyEntity[]
  before_each(() => {
    game.surfaces[1].find_entities().forEach((e) => e.destroy())
    entities = createRollingStocks("locomotive", "cargo-wagon", "fluid-wagon")
    assemblyEntities = entities.map((e) => {
      const aEntity = createAssemblyEntity(
        {
          name: e.name,
          orientation: e.orientation,
        },
        e.position,
        e.direction,
        1,
      )
      aEntity.replaceWorldEntity(1, e)
      assembly.content.add(aEntity)
      e.connect_rolling_stock(defines.rail_direction.front)
      return aEntity
    })
  })
  test("resetTrainLocation", () => {
    const anEntity = assemblyEntities[1]
    operations.resetTrain(assembly, anEntity)

    assert
      .spy(worldUpdater.updateWorldEntities)
      .called_with(match.ref(assembly), match.ref(assemblyEntities[0]), 1, 1, true)
    assert
      .spy(worldUpdater.updateWorldEntities)
      .called_with(match.ref(assembly), match.ref(assemblyEntities[1]), 1, 1, true)
    assert
      .spy(worldUpdater.updateWorldEntities)
      .called_with(match.ref(assembly), match.ref(assemblyEntities[2]), 1, 1, true)
  })
  test("setTrainLocationToCurrent", () => {
    entities[0].train!.speed = 10
    after_ticks(10, () => {
      const anEntity = assemblyEntities[1]
      operations.setTrainLocationToCurrent(assembly, anEntity)

      for (let i = 0; i < 3; i++) {
        assert.same(entities[i].position, assemblyEntities[i].position)
      }
    })
  })
})

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

import { createMockAssemblyContent } from "../../assembly/Assembly-mock"
import { AssemblyContent } from "../../assembly/AssemblyContent"
import {
  AssemblyOperations,
  AssemblyOpWorldInteractor,
  createAssemblyOperations,
} from "../../assembly/AssemblyOperations"
import { WorldUpdater } from "../../assembly/WorldUpdater"
import { createAssemblyEntity } from "../../entity/AssemblyEntity"
import { Pos } from "../../lib/geometry"

let assembly: AssemblyContent

let worldUpdater: mock.Mocked<WorldUpdater>
let worldInteractor: mock.Mocked<AssemblyOpWorldInteractor>

let operations: AssemblyOperations
before_each(() => {
  assembly = createMockAssemblyContent(3)
  worldUpdater = {
    updateWorldEntities: spy(),
    deleteWorldEntities: spy(),
    forceDeleteEntity: spy(),
    deleteWorldEntitiesInLayer: spy(),
    deleteExtraEntitiesOnly: spy(),
    makeSettingsRemnant: spy(),
    reviveSettingsRemnant: spy(),
  }
  worldInteractor = {
    deleteAllWorldEntities: spy(),
  }

  operations = createAssemblyOperations(worldUpdater, worldInteractor)
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

test("deleteLayerEntities", () => {
  const entity1 = createAssemblyEntity({ name: "test" }, Pos(0, 0), 0, 1)
  const entity2 = createAssemblyEntity({ name: "test2" }, Pos(0, 0), 0, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)

  operations.deleteLayerEntities(assembly, 1)
  assert.spy(worldUpdater.deleteWorldEntitiesInLayer).called_with(match.ref(entity1), 1)
  assert.spy(worldUpdater.deleteWorldEntitiesInLayer).called_with(match.ref(entity2), 1)
})

test("resetLayer", () => {
  const entity1 = createAssemblyEntity({ name: "test" }, Pos(0, 0), 0, 1)
  const entity2 = createAssemblyEntity({ name: "test2" }, Pos(0, 0), 0, 2)
  assembly.content.add(entity1)
  assembly.content.add(entity2)

  const layer = assembly.getLayer(2)!
  operations.resetLayer(assembly, layer)

  assert.spy(worldInteractor.deleteAllWorldEntities).called_with(match.ref(layer))

  assert.spy(worldUpdater.updateWorldEntities).called_with(match.ref(assembly), match.ref(entity1), 2, 2, true)
  assert.spy(worldUpdater.updateWorldEntities).called_with(match.ref(assembly), match.ref(entity2), 2, 2, true)
})

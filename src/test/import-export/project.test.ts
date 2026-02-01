// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { MapGenSettings } from "factorio:runtime"
import expect from "tstl-expect"
import { Entity } from "../../entity/Entity"
import { newProjectContent } from "../../entity/ProjectContent"
import { newProjectEntity } from "../../entity/ProjectEntity"
import { exportProject, importProjectDataOnly, ProjectExport } from "../../import-export/project"
import { asMutable, deepCopy, Mutable } from "../../lib"
import { getDefaultSurfaceSettings, NormalSurfaceSettings } from "../../project/surfaces"
import { _deleteAllProjects, createProject } from "../../project/Project"
import { simpleInsertPlan } from "../entity/entity-util"

after_each(() => {
  _deleteAllProjects()
})

const fromId = 2
const toId = 4
function createSampleProject() {
  const content = newProjectContent()

  const entity1 = newProjectEntity(
    {
      name: "foo",
      someProp: "bar",
    },
    { x: 2, y: 3 },
    4,
    2,
  )
  const entity2 = newProjectEntity(
    {
      name: "baz",
    },
    { x: 5, y: 6 },
    2,
    1,
  )
  content.addEntity(entity1)
  content.addEntity(entity2)

  content.addWireConnection({
    fromEntity: entity1,
    toEntity: entity2,
    fromId,
    toId,
  })

  const unstagedValue1 = { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] }
  const unstagedValue2 = { items: [simpleInsertPlan(defines.inventory.chest, "copper-plate", 1, 25)] }
  entity1.setUnstagedValue(2, unstagedValue1)
  entity2.setUnstagedValue(1, unstagedValue2)

  const project = createProject("name", 2, nil, content)
  project.settings.defaultBlueprintSettings.snapToGrid.set({ x: 4, y: 5 })

  const [stage1, stage2] = project.getAllStages()
  stage1.getSettings().name.set("foo")
  stage2.getSettings().name.set("bar")

  stage1.getSettings().blueprintOverrideSettings.snapToGrid.set({ x: 4, y: 5 })
  stage2.getSettings().stageBlueprintSettings.description.set("Foo")

  return project
}

test("exports project correctly", () => {
  const project = createSampleProject()
  const result = exportProject(project)
  expect(result).toMatchTable({
    name: "name",
    defaultBlueprintSettings: {
      snapToGrid: { x: 4, y: 5 },
    },
    stages: [
      {
        name: "foo",
        blueprintOverrideSettings: {
          snapToGrid: { x: 4, y: 5 },
        },
      },
      {
        name: "bar",
        stageBlueprintSettings: {
          description: "Foo",
        },
      },
    ],
    entities: [
      {
        entityNumber: 1,
        firstValue: {
          name: "foo",
          someProp: "bar",
        } as Entity,
        position: { x: 2, y: 3 },
        firstStage: 2,
        lastStage: nil,
        wires: [[1, fromId, 2, toId]],
        unstagedValue: {
          2: { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] },
        },
      },
      {
        entityNumber: 2,
        firstValue: {
          name: "baz",
        } as Entity,
        position: { x: 5, y: 6 },
        firstStage: 1,
        lastStage: nil,
        wires: [[2, toId, 1, fromId]],
        unstagedValue: {
          1: { items: [simpleInsertPlan(defines.inventory.chest, "copper-plate", 1, 25)] },
        },
      },
    ],
  } satisfies ProjectExport)
})

test("round trips export correctly", () => {
  const project = createSampleProject()
  const result = exportProject(project)
  const roundTrip = exportProject(importProjectDataOnly(result))
  expect(roundTrip).toEqual(result)
})

test("preserves unstaged values in round trip", () => {
  const project = createSampleProject()

  // Find entities and verify unstaged values were set
  const entities = [...project.content.allEntities()]
  expect(entities).toHaveLength(2)

  const entity1 = entities.find((e) => e.firstValue.name == "foo")!
  const entity2 = entities.find((e) => e.firstValue.name == "baz")!

  expect(entity1.getUnstagedValue(2)).toEqual({ items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] })
  expect(entity2.getUnstagedValue(1)).toEqual({
    items: [simpleInsertPlan(defines.inventory.chest, "copper-plate", 1, 25)],
  })

  const exported = exportProject(project)
  const imported = importProjectDataOnly(exported)

  const importedEntities = [...imported.content.allEntities()]
  const importedEntity1 = importedEntities.find((e) => e.firstValue.name == "foo")!
  const importedEntity2 = importedEntities.find((e) => e.firstValue.name == "baz")!

  expect(importedEntity1.getUnstagedValue(2)).toEqual({
    items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)],
  })
  expect(importedEntity2.getUnstagedValue(1)).toEqual({
    items: [simpleInsertPlan(defines.inventory.chest, "copper-plate", 1, 25)],
  })
})

test("exports and imports surface settings", () => {
  const project = createProject("Test", 2)

  const vulcanus = prototypes.space_location["vulcanus"]
  const mapGenSettings: Mutable<MapGenSettings> = asMutable(deepCopy(vulcanus.map_gen_settings!))
  mapGenSettings.seed = 54321

  const settings: NormalSurfaceSettings = {
    type: "normal",
    map_gen_settings: mapGenSettings,
    generate_with_lab_tiles: false,
    ignore_surface_conditions: true,
    planet: "vulcanus",
    has_global_electric_network: false,
  }

  project.settings.surfaceSettings = settings

  const exported = exportProject(project)
  expect(exported.surfaceSettings).toEqual(settings)

  const imported = importProjectDataOnly(exported)
  expect(imported.settings.surfaceSettings).toEqual({ ...getDefaultSurfaceSettings(), ...settings })
})

test("imports project without surface settings (backward compatibility)", () => {
  const exported: ProjectExport = {
    name: "Test",
    stages: [{ name: "Stage 1" }],
    entities: [],
  }

  const imported = importProjectDataOnly(exported)

  const settings = imported.settings.surfaceSettings as NormalSurfaceSettings
  expect(settings.map_gen_settings).toEqual(game.default_map_gen_settings)
  expect(settings.generate_with_lab_tiles).toBe(true)
  expect(settings.ignore_surface_conditions).toBe(true)
})

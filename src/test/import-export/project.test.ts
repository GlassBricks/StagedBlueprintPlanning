// Copyright (c) 2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { Entity } from "../../entity/Entity"
import { addWireConnection, newProjectEntity } from "../../entity/ProjectEntity"
import { exportProject, importProjectDataOnly, ProjectExport } from "../../import-export/project"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { simpleInsertPlan } from "../entity/entity-util"

after_each(() => {
  _deleteAllProjects()
})

const fromId = 2
const toId = 4
function createSampleProject() {
  const project = createUserProject("name", 2)
  project.defaultBlueprintSettings.snapToGrid.set({ x: 4, y: 5 })

  const [stage1, stage2] = project.getAllStages()
  stage1.name.set("foo")
  stage2.name.set("bar")

  stage1.blueprintOverrideSettings.snapToGrid.set({ x: 4, y: 5 })
  stage2.stageBlueprintSettings.description.set("Foo")

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
  project.content.addEntity(entity1)
  project.content.addEntity(entity2)

  addWireConnection({
    fromEntity: entity1,
    toEntity: entity2,
    fromId,
    toId,
  })

  // Add unstaged values for testing
  const unstagedValue1 = { items: [simpleInsertPlan(defines.inventory.chest, "iron-ore", 0, 10)] }
  const unstagedValue2 = { items: [simpleInsertPlan(defines.inventory.chest, "copper-plate", 1, 25)] }
  entity1.setUnstagedValue(2, unstagedValue1)
  entity2.setUnstagedValue(1, unstagedValue2)

  return project
}

test("Basic export test", () => {
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

test("Round trip export test", () => {
  const project = createSampleProject()
  const result = exportProject(project)
  const roundTrip = exportProject(importProjectDataOnly(result))
  expect(roundTrip).toEqual(result)
})

test("Unstaged values are preserved in round trip", () => {
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

/*
 * Copyright (c) 2025 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import { exportProject, importProjectDataOnly, ProjectExport } from "../../import-export/project"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"
import { createProjectEntityNoCopy } from "../../entity/ProjectEntity"
import { Entity } from "../../entity/Entity"

after_each(() => {
  _deleteAllProjects()
})

test("Basic export test", () => {
  const project = createUserProject("name", 2)
  project.defaultBlueprintSettings.snapToGrid.set({ x: 4, y: 5 })

  const [stage1, stage2] = project.getAllStages()
  stage1.name.set("foo")
  stage2.name.set("bar")

  stage1.blueprintOverrideSettings.snapToGrid.set({ x: 4, y: 5 })
  stage2.stageBlueprintSettings.description.set("Foo")

  project.content.addEntity(
    createProjectEntityNoCopy(
      {
        name: "foo",
        someProp: "bar",
      },
      { x: 2, y: 3 },
      4,
      2,
    ),
  )

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
      },
    ],
  } satisfies ProjectExport)

  // round trip test
  const roundTrip = exportProject(importProjectDataOnly(result))
  expect(roundTrip).toEqual(result)
})

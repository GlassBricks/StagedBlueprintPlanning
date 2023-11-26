/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect, { AnySelflessFun, mock, MockNoSelf } from "tstl-expect"
import { PreStageDeletedEvent, ProjectCreatedEvent, StageAddedEvent, UserProject } from "../../project/ProjectDef"
import { getStageAtSurface } from "../../project/stage-surface"
import { _deleteAllProjects, createUserProject, ProjectEvents } from "../../project/UserProject"

let eventListener: MockNoSelf<AnySelflessFun>
before_each(() => {
  eventListener = mock.fnNoSelf()
  ProjectEvents.addListener(eventListener)
})
after_each(() => {
  ProjectEvents.removeListener(eventListener)
  _deleteAllProjects()
})

test("project created calls event", () => {
  const project = createUserProject("Mock", 0)
  expect(eventListener).toHaveBeenCalledWith({
    type: "project-created",
    project,
  } as ProjectCreatedEvent)
})

test("getStageAtSurface", () => {
  const project = createUserProject("Mock", 2)
  const stage1 = project.getStage(1)!,
    stage2 = project.getStage(2)!
  expect(getStageAtSurface(stage1.surface.index)).toBe(stage1)
  expect(getStageAtSurface(stage2.surface.index)).toBe(stage2)
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const project = createUserProject("Test", 0)
    project.delete()
    expect(project.valid).toBe(false)
  })
  test("sets stages to invalid", () => {
    const project = createUserProject("Test", 1)
    const stage = project.getStage(1)!
    expect(stage.valid).toBe(true)
    project.delete()
    expect(stage.valid).toBe(false)
  })
  test("calls event", () => {
    const project = createUserProject("Mock", 0)
    const sp2 = mock.fn()
    project.localEvents._subscribeIndependently({ invoke: sp2 })
    project.delete()
    expect(eventListener).toHaveBeenCalledWith({
      type: "project-deleted",
      project,
    })
    expect(sp2).toHaveBeenCalledWith({
      type: "project-deleted",
      project,
    })
  })
})

describe("Stages", () => {
  let project: UserProject
  before_each(() => {
    project = createUserProject("Test", 2)
  })
  test("stageNumber is correct", () => {
    expect(project.getStage(1)!.stageNumber).toEqual(1)
    expect(project.getStage(2)!.stageNumber).toEqual(2)
  })
  test("initial name is correct", () => {
    const stage = project.getStage(1)!
    expect(stage.name.get()).toEqual("Stage 1")
  })
})

test("insert stage", () => {
  const sp = mock.fn()
  const project = createUserProject("Mock", 2)
  const oldStage = project.getStage(1)!
  project.localEvents._subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage = project.insertStage(1)

  expect(oldStage.surface.index).not.toEqual(stage.surface.index)

  expect(stage.stageNumber).toEqual(1)
  expect(oldStage.stageNumber).toEqual(2)

  expect(getStageAtSurface(stage.surface.index)).toBe(stage)
  expect(getStageAtSurface(oldStage.surface.index)).toBe(oldStage)

  expect(stage.name.get()).toEqual("Stage 0")

  expect(project.getStage(1)!).toEqual(stage)
  expect(project.getStage(2)!).toEqual(oldStage)

  const expected: StageAddedEvent = {
    type: "stage-added",
    project,
    stage,
  }
  expect(eventListener).toHaveBeenCalledWith(expected)
  expect(sp).toHaveBeenCalledWith(expected)

  const anotherInserted = project.insertStage(1)
  expect(anotherInserted).not.toBe(stage)
  expect(getStageAtSurface(anotherInserted.surface.index)).toEqual(anotherInserted)
  expect(getStageAtSurface(stage.surface.index)).toEqual(stage)
  expect(getStageAtSurface(oldStage.surface.index)).toEqual(oldStage)
  expect(anotherInserted.name.get()).toEqual("New Stage")

  expect(anotherInserted.stageNumber).toEqual(1)
  expect(stage.stageNumber).toEqual(2)
  expect(oldStage.stageNumber).toEqual(3)

  expect(project.getStage(1)!).toEqual(anotherInserted)
  expect(project.getStage(2)!).toEqual(stage)
  expect(project.getStage(3)!).toEqual(oldStage)
})

test("delete stage", () => {
  const sp = mock.fn()
  const project = createUserProject("Test", 3)
  project.localEvents._subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage1 = project.getStage(1)!
  const stage2 = project.getStage(2)!
  const stage3 = project.getStage(3)!

  project.deleteStage(2)

  const stage2Surface = stage2.surface.index
  expect(stage2.valid).toBe(false)

  expect(stage1.stageNumber).toEqual(1)
  expect(stage3.stageNumber).toEqual(2)

  expect(getStageAtSurface(stage1.surface.index)).toBe(stage1)
  expect(getStageAtSurface(stage3.surface.index)).toBe(stage3)
  expect(getStageAtSurface(stage2Surface)).toBeNil()

  expect(project.getStage(1)!).toEqual(stage1)
  expect(project.getStage(2)!).toEqual(stage3)

  const expected: PreStageDeletedEvent = {
    type: "pre-stage-deleted",
    project,
    stage: stage2,
  }
  expect(eventListener).toHaveBeenCalledWith(expected)
  expect(sp).toHaveBeenCalledWith(expected)
})

test("delete stage by deleting surface", () => {
  const project = createUserProject("Test", 2)
  const stage = project.getStage(2)!
  game.delete_surface(stage.surface)
  async()
  after_ticks(1, () => {
    expect(stage.valid).toBe(false)
    done()
  })
})

test("deleting last stage deletes project", () => {
  const project = createUserProject("Test", 1)
  const stage = project.getStage(1)!
  stage.deleteInProject()
  expect(project.valid).toBe(false)
})

describe("new stage name", () => {
  let project: UserProject
  before_each(() => {
    project = createUserProject("Test", 2)
  })

  describe("first stage", () => {
    test("is 'New Stage' if no naming convention", () => {
      project.getStage(1)!.name.set("Foo")

      const stage = project.insertStage(1)

      expect(stage.name.get()).toEqual("New Stage")
      expect(stage.stageBlueprintSettings.icons.get()).toEqual([
        {
          index: 1,
          signal: { type: "virtual", name: "signal-1" },
        },
      ])
    })

    test("is next number minus 1 if numbered naming convention", () => {
      project.getStage(1)!.name.set("Foo 1")

      // expect(project._getNewStageName(1)).toEqual({
      //   name: "Foo 2",
      //   strategy: "decrement",
      //   lastNumber: 2,
      //   previousLastNumber: 3,
      // })

      const stage = project.insertStage(1)
      expect(stage.name.get()).toEqual("Foo 0")
      expect(stage.stageBlueprintSettings.icons.get()).toEqual([
        {
          index: 1,
          signal: { type: "virtual", name: "signal-0" },
        },
      ])
    })
  })

  describe("other stages", () => {
    test('adds " 1" if no naming convention', () => {
      project.getStage(1)!.name.set("Foo")
      project.getStage(1)!.stageBlueprintSettings.icons.set([
        {
          index: 1,
          signal: { type: "item", name: "iron-plate" },
        },
      ])

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 1")
      expect(stage.stageBlueprintSettings.icons.get()).toEqual([
        {
          index: 1,
          signal: { type: "item", name: "iron-plate" },
        },
        {
          index: 2,
          signal: { type: "virtual", name: "signal-1" },
        },
      ])
    })

    test("increments number if numbered naming convention", () => {
      project.getStage(1)!.name.set("Foo 1")

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 2")
      expect(stage.stageBlueprintSettings.icons.get()).toEqual([
        {
          index: 1,
          signal: { type: "virtual", name: "signal-2" },
        },
      ])
    })

    test('adds ".1" if numbered naming convention, but next stage already has that name', () => {
      project.getStage(1)!.name.set("Foo 3")
      project.getStage(2)!.name.set("Foo 4")

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 3.1")
      expect(stage.stageBlueprintSettings.icons.get()).toEqual([
        {
          index: 1,
          signal: { type: "virtual", name: "signal-1" },
        },
        {
          index: 2,
          signal: { type: "virtual", name: "signal-1" },
        },
      ])
    })

    test("detects and uses numerical separator if next stage already has that name", () => {
      project.getStage(1)!.name.set("Foo 3--2")
      project.getStage(2)!.name.set("Foo 3--3")
      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 3--2--1")
      expect(stage.stageBlueprintSettings.icons.get()).toEqual([
        {
          index: 1,
          signal: { type: "virtual", name: "signal-1" },
        },
        {
          index: 2,
          signal: { type: "virtual", name: "signal-1" },
        },
      ])
    })
  })
})

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
import { _deleteAllProjects, createUserProject, getStageAtSurface, ProjectEvents } from "../../project/UserProject"

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
  expect(eventListener).calledWith({
    type: "project-created",
    project,
  } as ProjectCreatedEvent)
})

test("getStageAtSurface", () => {
  const project = createUserProject("Mock", 2)
  const stage1 = project.getStage(1)!,
    stage2 = project.getStage(2)!
  expect(getStageAtSurface(stage1.surface.index)).to.be(stage1)
  expect(getStageAtSurface(stage2.surface.index)).to.be(stage2)
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const project = createUserProject("Test", 0)
    project.delete()
    expect(project.valid).to.be(false)
  })
  test("sets stages to invalid", () => {
    const project = createUserProject("Test", 1)
    const stage = project.getStage(1)!
    expect(stage.valid).to.be(true)
    project.delete()
    expect(stage.valid).to.be(false)
  })
  test("calls event", () => {
    const project = createUserProject("Mock", 0)
    const sp2 = mock.fn()
    project.localEvents._subscribeIndependently({ invoke: sp2 })
    project.delete()
    expect(eventListener).calledWith({
      type: "project-deleted",
      project,
    })
    expect(sp2).calledWith({
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
    expect(project.getStage(1)!.stageNumber).to.equal(1)
    expect(project.getStage(2)!.stageNumber).to.equal(2)
  })
  test("initial name is correct", () => {
    const stage = project.getStage(1)!
    expect(stage.name.get()).to.equal("Stage 1")
  })
})

test("insert stage", () => {
  const sp = mock.fn()
  const project = createUserProject("Mock", 2)
  const oldStage = project.getStage(1)!
  project.localEvents._subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage = project.insertStage(1)

  expect(oldStage.surface.index).not.to.equal(stage.surface.index)

  expect(stage.stageNumber).to.equal(1)
  expect(oldStage.stageNumber).to.equal(2)

  expect(getStageAtSurface(stage.surface.index)).to.be(stage)
  expect(getStageAtSurface(oldStage.surface.index)).to.be(oldStage)

  expect(stage.name.get()).to.equal("Stage 0")

  expect(project.getStage(1)!).to.equal(stage)
  expect(project.getStage(2)!).to.equal(oldStage)

  const expected: StageAddedEvent = {
    type: "stage-added",
    project,
    stage,
  }
  expect(eventListener).calledWith(expected)
  expect(sp).calledWith(expected)

  const anotherInserted = project.insertStage(1)
  expect(anotherInserted).not.to.be(stage)
  expect(getStageAtSurface(anotherInserted.surface.index)).to.equal(anotherInserted)
  expect(getStageAtSurface(stage.surface.index)).to.equal(stage)
  expect(getStageAtSurface(oldStage.surface.index)).to.equal(oldStage)
  expect(anotherInserted.name.get()).to.equal("New Stage")

  expect(anotherInserted.stageNumber).to.equal(1)
  expect(stage.stageNumber).to.equal(2)
  expect(oldStage.stageNumber).to.equal(3)

  expect(project.getStage(1)!).to.equal(anotherInserted)
  expect(project.getStage(2)!).to.equal(stage)
  expect(project.getStage(3)!).to.equal(oldStage)
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
  expect(stage2.valid).to.be(false)

  expect(stage1.stageNumber).to.equal(1)
  expect(stage3.stageNumber).to.equal(2)

  expect(getStageAtSurface(stage1.surface.index)).to.be(stage1)
  expect(getStageAtSurface(stage3.surface.index)).to.be(stage3)
  expect(getStageAtSurface(stage2Surface)).to.be.nil()

  expect(project.getStage(1)!).to.equal(stage1)
  expect(project.getStage(2)!).to.equal(stage3)

  const expected: PreStageDeletedEvent = {
    type: "pre-stage-deleted",
    project,
    stage: stage2,
  }
  expect(eventListener).calledWith(expected)
  expect(sp).calledWith(expected)
})

test("delete stage by deleting surface", () => {
  const project = createUserProject("Test", 2)
  const stage = project.getStage(2)!
  game.delete_surface(stage.surface)
  async()
  after_ticks(1, () => {
    expect(stage.valid).to.be(false)
    done()
  })
})

test("deleting last stage deletes project", () => {
  const project = createUserProject("Test", 1)
  const stage = project.getStage(1)!
  stage.deleteInProject()
  expect(project.valid).to.be(false)
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

      expect(stage.name.get()).to.equal("New Stage")
      expect(stage.stageBlueprintSettings.icons.get()).to.equal([
        {
          index: 1,
          signal: { type: "virtual", name: "signal-1" },
        },
      ])
    })

    test("is next number minus 1 if numbered naming convention", () => {
      project.getStage(1)!.name.set("Foo 1")

      // expect(project._getNewStageName(1)).to.equal({
      //   name: "Foo 2",
      //   strategy: "decrement",
      //   lastNumber: 2,
      //   previousLastNumber: 3,
      // })

      const stage = project.insertStage(1)
      expect(stage.name.get()).to.equal("Foo 0")
      expect(stage.stageBlueprintSettings.icons.get()).to.equal([
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
      expect(stage.name.get()).to.equal("Foo 1")
      expect(stage.stageBlueprintSettings.icons.get()).to.equal([
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
      expect(stage.name.get()).to.equal("Foo 2")
      expect(stage.stageBlueprintSettings.icons.get()).to.equal([
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
      expect(stage.name.get()).to.equal("Foo 3.1")
      expect(stage.stageBlueprintSettings.icons.get()).to.equal([
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
      expect(stage.name.get()).to.equal("Foo 3--2--1")
      expect(stage.stageBlueprintSettings.icons.get()).to.equal([
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

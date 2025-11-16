// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { AnySelflessFun, mock, MockNoSelf } from "tstl-expect"
import { getIconsFromSettings } from "../../blueprints/blueprint-settings"
import { getReferencedStage } from "../../blueprints/stage-reference"
import { getProjectById, getStageAtSurface } from "../../project/project-refs"
import { PreStageDeletedEvent, ProjectCreatedEvent, StageAddedEvent, UserProject } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject, ProjectEvents } from "../../project/UserProject"
import { getCurrentValues } from "../../utils/properties-obj"

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

test("getProjectById", () => {
  const project = createUserProject("Test2", 0)
  expect(getProjectById(project.id)).toBe(project)
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

  project.mergeStage(2)

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
  stage.deleteByMerging()
  expect(project.valid).toBe(false)
})

describe("discardStage()", () => {
  test("discards stage and raises events", () => {
    const sp = mock.fn()
    const project = createUserProject("Test", 3)
    project.localEvents._subscribeIndependently({ invoke: sp })
    eventListener.clear()

    const stage1 = project.getStage(1)!
    const stage2 = project.getStage(2)!
    const stage3 = project.getStage(3)!

    project.discardStage(2)

    expect(stage2.valid).toBe(false)
    expect(stage1.stageNumber).toEqual(1)
    expect(stage3.stageNumber).toEqual(2)

    const expected: PreStageDeletedEvent = {
      type: "pre-stage-deleted",
      project,
      stage: stage2,
    }
    expect(eventListener).toHaveBeenCalledWith(expected)
    expect(sp).toHaveBeenCalledWith(expected)
  })

  test("deletes entire project when discarding only stage", () => {
    const project = createUserProject("Test", 1)
    const stage = project.getStage(1)!

    project.discardStage(1)

    expect(project.valid).toBe(false)
    expect(stage.valid).toBe(false)
  })
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
      expect(getIconsFromSettings(getCurrentValues(stage.getBlueprintSettingsView()))).toBeNil()
    })

    test("is next number minus 1 if numbered naming convention", () => {
      project.getStage(1)!.name.set("Foo 1")
      const stage = project.insertStage(1)
      expect(stage.name.get()).toEqual("Foo 0")
      expect(getIconsFromSettings(getCurrentValues(stage.getBlueprintSettingsView()))).toBeNil()
    })
  })

  describe("other stages", () => {
    test('adds " 1" if no naming convention', () => {
      project.getStage(1)!.name.set("Foo")

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 1")
    })

    test("increments number if numbered naming convention", () => {
      project.getStage(1)!.name.set("Foo 1")

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 2")
    })

    test("increments 19 to 20 and 239 to 240", () => {
      project.getStage(1)!.name.set("Foo 19")

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 20")

      project.getStage(2)!.name.set("Foo 239")

      const stage2 = project.insertStage(3)
      expect(stage2.name.get()).toEqual("Foo 240")
    })

    test('adds ".1" if numbered naming convention, but next stage already has that name', () => {
      project.getStage(1)!.name.set("Foo 3")
      project.getStage(2)!.name.set("Foo 4")

      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 3.1")
    })

    test("detects and uses numerical separator if next stage already has that name", () => {
      project.getStage(1)!.name.set("Foo 3--2")
      project.getStage(2)!.name.set("Foo 3--3")
      const stage = project.insertStage(2)
      expect(stage.name.get()).toEqual("Foo 3--2--1")
    })
  })
})

describe("blueprintBookTemplate", () => {
  test("initially nil", () => {
    const project = createUserProject("Test", 0)
    expect(project.getBlueprintBookTemplate()).toBeNil()
  })

  test("can be set", () => {
    const project = createUserProject("Test", 0)
    const book = project.getOrCreateBlueprintBookTemplate()
    expect(project.getBlueprintBookTemplate()).toEqual(book)

    assert(book.is_blueprint_book)
    expect(book.label).toEqual(project.name.get())
    const inv = book.get_inventory(defines.inventory.item_main)!
    expect(inv.length).toEqual(project.numStages())
    for (const i of $range(1, project.numStages())) {
      const referencedStage = getReferencedStage(inv[i - 1])
      expect(referencedStage).toBe(project.getStage(i))
    }
  })
  test("can be reset", () => {
    const project = createUserProject("Test", 0)
    const book = project.getOrCreateBlueprintBookTemplate()
    project.resetBlueprintBookTemplate()
    expect(project.getBlueprintBookTemplate()).toBeNil()
    expect(book.valid).toBe(false)
  })

  test("can be fixed if deleted", () => {
    const project = createUserProject("Test", 0)
    const book = project.getOrCreateBlueprintBookTemplate()
    book.clear()
    expect(project.getBlueprintBookTemplate()).toBe(nil)
    const newBook = project.getOrCreateBlueprintBookTemplate()
    assert(newBook.is_blueprint_book)
  })

  test("changing project name changes book label", () => {
    const project = createUserProject("Test", 0)
    const book = project.getOrCreateBlueprintBookTemplate()
    project.name.set("New Name")
    expect(book.label).toEqual("New Name")
  })

  test("changing project name does not change book label if book label is different", () => {
    const project = createUserProject("Test", 0)
    const book = project.getOrCreateBlueprintBookTemplate()
    book.label = "Different"
    project.name.set("New Name")
    expect(book.label).toEqual("Different")
  })

  describe("inserting stage", () => {
    test("inserts template into new stage in middle", () => {
      const project = createUserProject("Test", 3)
      const book = project.getOrCreateBlueprintBookTemplate()
      for (const insertStage of [2, 4, 1, 7]) {
        project.insertStage(insertStage)
        for (const stage of $range(1, project.numStages())) {
          const referencedStage = getReferencedStage(book.get_inventory(defines.inventory.item_main)![stage - 1])
          expect(referencedStage).toBe(project.getStage(stage))
        }
      }
    })

    test("inserts template into empty space if exists", () => {
      const project = createUserProject("Test", 3)
      const book = project.getOrCreateBlueprintBookTemplate()
      const inventory = book.get_inventory(defines.inventory.item_main)!
      inventory[2 - 1].clear()
      project.insertStage(2)
      const referencedStage = getReferencedStage(inventory[2 - 1])
      expect(referencedStage).toBe(project.getStage(2))
    })

    test("only pushes in template until the next empty space", () => {
      const project = createUserProject("Test", 5)
      const book = project.getOrCreateBlueprintBookTemplate()
      const inventory = book.get_inventory(defines.inventory.item_main)!
      inventory[4 - 1].clear()
      project.insertStage(2)
      expect(getReferencedStage(inventory[2 - 1])).toBe(project.getStage(2))
      expect(getReferencedStage(inventory[3 - 1])).toBe(project.getStage(3))
      expect(getReferencedStage(inventory[4 - 1])).toBe(project.getStage(4))
    })

    test("can push past last stage with empty slots", () => {
      const project = createUserProject("Test", 5)
      const book = project.getOrCreateBlueprintBookTemplate()
      const inventory = book.get_inventory(defines.inventory.item_main)!
      inventory[2 - 1].clear()
      inventory[3 - 1].clear()
      project.insertStage(5)
      expect(getReferencedStage(inventory[5 - 1])).toBe(project.getStage(5))
      expect(getReferencedStage(inventory[6 - 1])).toBe(project.getStage(6))
      expect(inventory[2 - 1].valid_for_read).toBe(false)
      expect(inventory[3 - 1].valid_for_read).toBe(false)
    })
  })
})

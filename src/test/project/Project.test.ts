// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect, { AnySelflessFun, mock, MockNoSelf } from "tstl-expect"
import { getIconsFromSettings } from "../../blueprints/blueprint-settings"
import { getReferencedStage } from "../../blueprints/stage-reference"
import { Project } from "../../project/Project"
import { getProjectById, getStageAtSurface } from "../../project/project-refs"
import { projectCreated, projectDeleted } from "../../project/ProjectList"
import { _deleteAllProjects, createProject } from "../../project/Project"
import { getCurrentValues } from "../../utils/properties-obj"

let createdListener: MockNoSelf<AnySelflessFun>
let deletedListener: MockNoSelf<AnySelflessFun>
before_each(() => {
  createdListener = mock.fnNoSelf()
  deletedListener = mock.fnNoSelf()
  projectCreated.addListener(createdListener)
  projectDeleted.addListener(deletedListener)
})
after_each(() => {
  projectCreated.removeListener(createdListener)
  projectDeleted.removeListener(deletedListener)
  _deleteAllProjects()
})

test("project created fires projectCreated event", () => {
  const project = createProject("Mock", 0)
  expect(createdListener).toHaveBeenCalledWith(project)
})

test("getProjectById", () => {
  const project = createProject("Test2", 0)
  expect(getProjectById(project.id)).toBe(project)
})

test("getStageAtSurface", () => {
  const project = createProject("Mock", 2)
  const stage1 = project.getStage(1)!,
    stage2 = project.getStage(2)!
  expect(getStageAtSurface(stage1.getSurface().index)).toBe(stage1)
  expect(getStageAtSurface(stage2.getSurface().index)).toBe(stage2)
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const project = createProject("Test", 0)
    project.delete()
    expect(project.valid).toBe(false)
  })
  test("sets stages to invalid", () => {
    const project = createProject("Test", 1)
    const stage = project.getStage(1)!
    expect(stage.valid).toBe(true)
    project.delete()
    expect(stage.valid).toBe(false)
  })
  test("fires projectDeleted event", () => {
    const project = createProject("Mock", 0)
    project.delete()
    expect(deletedListener).toHaveBeenCalledWith(project)
  })
})

describe("Stages", () => {
  let project: Project
  before_each(() => {
    project = createProject("Test", 2)
  })
  test("stageNumber is correct", () => {
    expect(project.getStage(1)!.stageNumber).toEqual(1)
    expect(project.getStage(2)!.stageNumber).toEqual(2)
  })
  test("initial name is correct", () => {
    const stage = project.getStage(1)!
    expect(stage.getSettings().name.get()).toEqual("Stage 1")
  })
})

test("insert stage", () => {
  const stageAddedListener = mock.fn()
  const project = createProject("Mock", 2)
  const oldStage = project.getStage(1)!
  project.stageAdded._subscribeIndependently({ invoke: stageAddedListener })

  const stage = project.insertStage(1)

  expect(oldStage.getSurface().index).not.toEqual(stage.getSurface().index)

  expect(stage.stageNumber).toEqual(1)
  expect(oldStage.stageNumber).toEqual(2)

  expect(getStageAtSurface(stage.getSurface().index)).toBe(stage)
  expect(getStageAtSurface(oldStage.getSurface().index)).toBe(oldStage)

  expect(stage.getSettings().name.get()).toEqual("Stage 0")

  expect(project.getStage(1)!).toEqual(stage)
  expect(project.getStage(2)!).toEqual(oldStage)

  expect(stageAddedListener).toHaveBeenCalledWith(stage)

  const anotherInserted = project.insertStage(1)
  expect(anotherInserted).not.toBe(stage)
  expect(getStageAtSurface(anotherInserted.getSurface().index)).toEqual(anotherInserted)
  expect(getStageAtSurface(stage.getSurface().index)).toEqual(stage)
  expect(getStageAtSurface(oldStage.getSurface().index)).toEqual(oldStage)
  expect(anotherInserted.getSettings().name.get()).toEqual("New Stage")

  expect(anotherInserted.stageNumber).toEqual(1)
  expect(stage.stageNumber).toEqual(2)
  expect(oldStage.stageNumber).toEqual(3)

  expect(project.getStage(1)!).toEqual(anotherInserted)
  expect(project.getStage(2)!).toEqual(stage)
  expect(project.getStage(3)!).toEqual(oldStage)
})

test("delete stage", () => {
  const preDeleteListener = mock.fn()
  const deleteListener = mock.fn()
  const project = createProject("Test", 3)
  project.preStageDeleted._subscribeIndependently({ invoke: preDeleteListener })
  project.stageDeleted._subscribeIndependently({ invoke: deleteListener })

  const stage1 = project.getStage(1)!
  const stage2 = project.getStage(2)!
  const stage3 = project.getStage(3)!

  const stage2Surface = stage2.getSurface().index
  project.mergeStage(2)

  expect(stage2.valid).toBe(false)

  expect(stage1.stageNumber).toEqual(1)
  expect(stage3.stageNumber).toEqual(2)

  expect(getStageAtSurface(stage1.getSurface().index)).toBe(stage1)
  expect(getStageAtSurface(stage3.getSurface().index)).toBe(stage3)
  expect(getStageAtSurface(stage2Surface)).toBeNil()

  expect(project.getStage(1)!).toEqual(stage1)
  expect(project.getStage(2)!).toEqual(stage3)

  expect(preDeleteListener).toHaveBeenCalledWith(stage2)
  expect(deleteListener).toHaveBeenCalledWith(stage2)
})

test("delete stage by deleting surface", () => {
  const project = createProject("Test", 2)
  const stage = project.getStage(2)!
  game.delete_surface(stage.getSurface())
  async()
  after_ticks(1, () => {
    expect(stage.valid).toBe(false)
    done()
  })
})

test("deleting last stage deletes project", () => {
  const project = createProject("Test", 1)
  const stage = project.getStage(1)!
  stage.deleteByMerging()
  expect(project.valid).toBe(false)
})

describe("discardStage()", () => {
  test("discards stage and raises events", () => {
    const preDeleteListener = mock.fn()
    const project = createProject("Test", 3)
    project.preStageDeleted._subscribeIndependently({ invoke: preDeleteListener })

    const stage1 = project.getStage(1)!
    const stage2 = project.getStage(2)!
    const stage3 = project.getStage(3)!

    project.discardStage(2)

    expect(stage2.valid).toBe(false)
    expect(stage1.stageNumber).toEqual(1)
    expect(stage3.stageNumber).toEqual(2)

    expect(preDeleteListener).toHaveBeenCalledWith(stage2)
  })

  test("deletes entire project when discarding only stage", () => {
    const project = createProject("Test", 1)
    const stage = project.getStage(1)!

    project.discardStage(1)

    expect(project.valid).toBe(false)
    expect(stage.valid).toBe(false)
  })
})

describe("new stage name", () => {
  let project: Project
  before_each(() => {
    project = createProject("Test", 2)
  })

  describe("first stage", () => {
    test("is 'New Stage' if no naming convention", () => {
      project.getStage(1)!.getSettings().name.set("Foo")

      const stage = project.insertStage(1)

      expect(stage.getSettings().name.get()).toEqual("New Stage")
      expect(getIconsFromSettings(getCurrentValues(stage.getBlueprintSettingsView()))).toBeNil()
    })

    test("is next number minus 1 if numbered naming convention", () => {
      project.getStage(1)!.getSettings().name.set("Foo 1")
      const stage = project.insertStage(1)
      expect(stage.getSettings().name.get()).toEqual("Foo 0")
      expect(getIconsFromSettings(getCurrentValues(stage.getBlueprintSettingsView()))).toBeNil()
    })
  })

  describe("other stages", () => {
    test('adds " 1" if no naming convention', () => {
      project.getStage(1)!.getSettings().name.set("Foo")

      const stage = project.insertStage(2)
      expect(stage.getSettings().name.get()).toEqual("Foo 1")
    })

    test("increments number if numbered naming convention", () => {
      project.getStage(1)!.getSettings().name.set("Foo 1")

      const stage = project.insertStage(2)
      expect(stage.getSettings().name.get()).toEqual("Foo 2")
    })

    test("increments 19 to 20 and 239 to 240", () => {
      project.getStage(1)!.getSettings().name.set("Foo 19")

      const stage = project.insertStage(2)
      expect(stage.getSettings().name.get()).toEqual("Foo 20")

      project.getStage(2)!.getSettings().name.set("Foo 239")

      const stage2 = project.insertStage(3)
      expect(stage2.getSettings().name.get()).toEqual("Foo 240")
    })

    test('adds ".1" if numbered naming convention, but next stage already has that name', () => {
      project.getStage(1)!.getSettings().name.set("Foo 3")
      project.getStage(2)!.getSettings().name.set("Foo 4")

      const stage = project.insertStage(2)
      expect(stage.getSettings().name.get()).toEqual("Foo 3.1")
    })

    test("detects and uses numerical separator if next stage already has that name", () => {
      project.getStage(1)!.getSettings().name.set("Foo 3--2")
      project.getStage(2)!.getSettings().name.set("Foo 3--3")
      const stage = project.insertStage(2)
      expect(stage.getSettings().name.get()).toEqual("Foo 3--2--1")
    })
  })
})

describe("blueprintBookTemplate", () => {
  test("initially nil", () => {
    const project = createProject("Test", 0)
    expect(project.settings.blueprintBookTemplate.get("Test")).toBeNil()
  })

  test("can be set", () => {
    const project = createProject("Test", 0)
    const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
    expect(project.settings.blueprintBookTemplate.get("Test")).toEqual(book)

    assert(book.is_blueprint_book)
    expect(book.label).toEqual(project.settings.projectName.get())
    const inv = book.get_inventory(defines.inventory.item_main)!
    expect(inv.length).toEqual(project.settings.stageCount())
    for (const i of $range(1, project.settings.stageCount())) {
      const referencedStage = getReferencedStage(inv[i - 1])
      expect(referencedStage).toBe(project.getStage(i))
    }
  })
  test("can be reset", () => {
    const project = createProject("Test", 0)
    const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
    project.settings.blueprintBookTemplate.reset()
    expect(project.settings.blueprintBookTemplate.get("Test")).toBeNil()
    expect(book.valid).toBe(false)
  })

  test("can be fixed if deleted", () => {
    const project = createProject("Test", 0)
    const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
    book.clear()
    expect(project.settings.blueprintBookTemplate.get("Test")).toBe(nil)
    const newBook = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
    assert(newBook.is_blueprint_book)
  })

  test("get() sets label to projectName", () => {
    const project = createProject("Test", 0)
    project.settings.blueprintBookTemplate.getOrCreate(project, "Test")
    const book = project.settings.blueprintBookTemplate.get("New Name")
    expect(book).not.toBeNil()
    expect(book!.label).toBe("New Name")
  })

  describe("inserting stage", () => {
    test("inserts template into new stage in middle", () => {
      const project = createProject("Test", 3)
      const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
      for (const insertStage of [2, 4, 1, 7]) {
        project.insertStage(insertStage)
        for (const stage of $range(1, project.settings.stageCount())) {
          const referencedStage = getReferencedStage(book.get_inventory(defines.inventory.item_main)![stage - 1])
          expect(referencedStage).toBe(project.getStage(stage))
        }
      }
    })

    test("inserts template into empty space if exists", () => {
      const project = createProject("Test", 3)
      const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
      const inventory = book.get_inventory(defines.inventory.item_main)!
      inventory[2 - 1].clear()
      project.insertStage(2)
      const referencedStage = getReferencedStage(inventory[2 - 1])
      expect(referencedStage).toBe(project.getStage(2))
    })

    test("only pushes in template until the next empty space", () => {
      const project = createProject("Test", 5)
      const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
      const inventory = book.get_inventory(defines.inventory.item_main)!
      inventory[4 - 1].clear()
      project.insertStage(2)
      expect(getReferencedStage(inventory[2 - 1])).toBe(project.getStage(2))
      expect(getReferencedStage(inventory[3 - 1])).toBe(project.getStage(3))
      expect(getReferencedStage(inventory[4 - 1])).toBe(project.getStage(4))
    })

    test("can push past last stage with empty slots", () => {
      const project = createProject("Test", 5)
      const book = project.settings.blueprintBookTemplate.getOrCreate(project, project.settings.projectName.get())
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

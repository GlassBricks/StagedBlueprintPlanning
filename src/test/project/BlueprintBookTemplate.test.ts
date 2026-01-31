import expect from "tstl-expect"
import { getReferencedStage } from "../../blueprints/stage-reference"
import { BlueprintBookTemplate } from "../../project/BlueprintBookTemplate"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"

after_each(() => {
  _deleteAllProjects()
})

test("get() returns nil initially", () => {
  const template = new BlueprintBookTemplate()
  expect(template.get()).toBeNil()
})

test("getOrCreate() creates book with correct stage references", () => {
  const project = createUserProject("Test", 3)
  const template = project.settings.blueprintBookTemplate
  const book = template.getOrCreate(project, project.settings.projectName.get())

  assert(book.is_blueprint_book)
  expect(book.label).toBe("Test")
  const inv = book.get_inventory(defines.inventory.item_main)!
  expect(inv.length).toBe(project.settings.stageCount())
  for (const i of $range(1, project.settings.stageCount())) {
    const referencedStage = getReferencedStage(inv[i - 1])
    expect(referencedStage).toBe(project.getStage(i))
  }
})

test("reset() destroys inventory, subsequent get() returns nil", () => {
  const project = createUserProject("Test", 2)
  const template = project.settings.blueprintBookTemplate
  const book = template.getOrCreate(project, project.settings.projectName.get())
  template.reset()
  expect(template.get()).toBeNil()
  expect(book.valid).toBe(false)
})

test("onProjectNameChanged() updates label when label matches old name", () => {
  const project = createUserProject("Test", 2)
  const template = project.settings.blueprintBookTemplate
  const book = template.getOrCreate(project, "Test")
  template.onProjectNameChanged("New Name", "Test")
  expect(book.label).toBe("New Name")
})

test("onProjectNameChanged() does not update label when label differs", () => {
  const project = createUserProject("Test", 2)
  const template = project.settings.blueprintBookTemplate
  const book = template.getOrCreate(project, "Test")
  book.label = "Custom Label"
  template.onProjectNameChanged("New Name", "Test")
  expect(book.label).toBe("Custom Label")
})

describe("onStageInserted()", () => {
  test("inserts reference at correct position in middle", () => {
    const project = createUserProject("Test", 3)
    const template = project.settings.blueprintBookTemplate
    const book = template.getOrCreate(project, "Test")
    project.insertStage(2)
    for (const stage of $range(1, project.settings.stageCount())) {
      const referencedStage = getReferencedStage(book.get_inventory(defines.inventory.item_main)![stage - 1])
      expect(referencedStage).toBe(project.getStage(stage))
    }
  })

  test("handles empty slots", () => {
    const project = createUserProject("Test", 3)
    const template = project.settings.blueprintBookTemplate
    const book = template.getOrCreate(project, "Test")
    const inventory = book.get_inventory(defines.inventory.item_main)!
    inventory[2 - 1].clear()
    project.insertStage(2)
    const referencedStage = getReferencedStage(inventory[2 - 1])
    expect(referencedStage).toBe(project.getStage(2))
  })
})

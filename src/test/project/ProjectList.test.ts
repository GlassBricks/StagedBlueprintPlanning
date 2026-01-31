import expect, { mock, MockNoSelf } from "tstl-expect"
import { Project } from "../../project/Project"
import {
  getAllProjects,
  getProjectById,
  getProjectCount,
  moveProjectDown,
  moveProjectUp,
  projectCreated,
  projectDeleted,
  projectsReordered,
} from "../../project/ProjectList"
import { _deleteAllProjects, createProject } from "../../project/Project"

after_each(() => {
  _deleteAllProjects()
})

describe("addProject()", () => {
  test("appends to list and fires projectCreated", () => {
    const listener: MockNoSelf<(project: Project) => void> = mock.fnNoSelf()
    projectCreated.addListener(listener)

    const project = createProject("Test", 1)

    expect(listener).toHaveBeenCalledWith(project)
    expect(getAllProjects()).toContain(project)

    projectCreated.removeListener(listener)
  })
})

describe("removeProject()", () => {
  test("removes from list and fires projectDeleted", () => {
    const listener: MockNoSelf<(project: Project) => void> = mock.fnNoSelf()
    projectDeleted.addListener(listener)

    const project = createProject("Test", 1)
    project.delete()

    expect(listener).toHaveBeenCalledWith(project)
    expect(getAllProjects()).not.toContain(project)

    projectDeleted.removeListener(listener)
  })
})

describe("getAllProjects()", () => {
  test("returns projects in insertion order", () => {
    const p1 = createProject("A", 1)
    const p2 = createProject("B", 1)
    const p3 = createProject("C", 1)

    const all = getAllProjects()
    expect(all[0]).toBe(p1)
    expect(all[1]).toBe(p2)
    expect(all[2]).toBe(p3)
  })
})

describe("getProjectCount()", () => {
  test("returns correct count", () => {
    expect(getProjectCount()).toBe(0)
    createProject("A", 1)
    expect(getProjectCount()).toBe(1)
    createProject("B", 1)
    expect(getProjectCount()).toBe(2)
  })
})

describe("getProjectById()", () => {
  test("returns project by id", () => {
    const project = createProject("Test", 1)
    expect(getProjectById(project.id)).toBe(project)
  })

  test("returns nil for missing id", () => {
    createProject("Test", 1)
    expect(getProjectById(999 as any)).toBeNil()
  })
})

describe("moveProjectUp()", () => {
  test("swaps with previous and fires projectsReordered", () => {
    const listener: MockNoSelf<(p1: Project, p2: Project) => void> = mock.fnNoSelf()
    projectsReordered.addListener(listener)

    const p1 = createProject("A", 1)
    const p2 = createProject("B", 1)

    const result = moveProjectUp(p2)

    expect(result).toBe(true)
    expect(getAllProjects()[0]).toBe(p2)
    expect(getAllProjects()[1]).toBe(p1)
    expect(listener).toHaveBeenCalledWith(p2, p1)

    projectsReordered.removeListener(listener)
  })

  test("returns false at start of list", () => {
    const p1 = createProject("A", 1)
    createProject("B", 1)

    expect(moveProjectUp(p1)).toBe(false)
  })
})

describe("moveProjectDown()", () => {
  test("swaps with next and fires projectsReordered", () => {
    const listener: MockNoSelf<(p1: Project, p2: Project) => void> = mock.fnNoSelf()
    projectsReordered.addListener(listener)

    const p1 = createProject("A", 1)
    const p2 = createProject("B", 1)

    const result = moveProjectDown(p1)

    expect(result).toBe(true)
    expect(getAllProjects()[0]).toBe(p2)
    expect(getAllProjects()[1]).toBe(p1)
    expect(listener).toHaveBeenCalledWith(p2, p1)

    projectsReordered.removeListener(listener)
  })

  test("returns false at end of list", () => {
    createProject("A", 1)
    const p2 = createProject("B", 1)

    expect(moveProjectDown(p2)).toBe(false)
  })
})

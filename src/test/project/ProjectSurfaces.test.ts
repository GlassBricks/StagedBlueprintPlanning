import expect from "tstl-expect"
import { ProjectSettings } from "../../project/ProjectSettings"
import { ProjectSurfaces } from "../../project/ProjectSurfaces"
import { getDefaultSurfaceSettings } from "../../project/surfaces"

let settings: ProjectSettings
let surfaces: ProjectSurfaces

before_each(() => {
  settings = new ProjectSettings("TestProject", getDefaultSurfaceSettings())
  settings.insertStageSettings(1, "Stage 1")
  settings.insertStageSettings(2, "Stage 2")
  settings.insertStageSettings(3, "Stage 3")

  surfaces = new ProjectSurfaces(settings)
  for (const i of $range(1, 3)) {
    surfaces.createSurface(i, nil)
  }
  surfaces.registerEvents()
})

after_each(() => {
  surfaces.destroyAll()
  surfaces.close()
})

test("createSurface() creates a valid surface", () => {
  const surface = surfaces.getSurface(1)
  expect(surface).not.toBeNil()
  expect(surface!.valid).toBe(true)
})

test("getSurface() returns correct surface by stage number", () => {
  const s1 = surfaces.getSurface(1)
  const s2 = surfaces.getSurface(2)
  const s3 = surfaces.getSurface(3)
  expect(s1).not.toBeNil()
  expect(s2).not.toBeNil()
  expect(s3).not.toBeNil()
  expect(s1!.index).not.toEqual(s2!.index)
  expect(s2!.index).not.toEqual(s3!.index)
})

test("getSurface() returns nil for invalid stage", () => {
  expect(surfaces.getSurface(4)).toBeNil()
  expect(surfaces.getSurface(0 as any)).toBeNil()
})

test("surfaceCount() returns correct count", () => {
  expect(surfaces.surfaceCount()).toBe(3)
})

test("getAllSurfaces() returns ordered list", () => {
  const all = surfaces.getAllSurfaces()
  expect(all[0]).toBe(surfaces.getSurface(1))
  expect(all[1]).toBe(surfaces.getSurface(2))
  expect(all[2]).toBe(surfaces.getSurface(3))
})

describe("insertSurface()", () => {
  test("creates surface and shifts existing surfaces", () => {
    const originalS2 = surfaces.getSurface(2)!
    const originalS3 = surfaces.getSurface(3)!

    settings.insertStageSettings(2, "Inserted Stage")
    surfaces.insertSurface(2, nil)

    expect(surfaces.surfaceCount()).toBe(4)
    expect(surfaces.getSurface(2)).not.toBe(originalS2)
    expect(surfaces.getSurface(3)!.index).toBe(originalS2.index)
    expect(surfaces.getSurface(4)!.index).toBe(originalS3.index)
  })

  test("inserts at beginning", () => {
    const originalS1 = surfaces.getSurface(1)!

    settings.insertStageSettings(1, "First Stage")
    surfaces.insertSurface(1, nil)

    expect(surfaces.surfaceCount()).toBe(4)
    expect(surfaces.getSurface(1)).not.toBe(originalS1)
    expect(surfaces.getSurface(2)!.index).toBe(originalS1.index)
  })

  test("inserts at end", () => {
    settings.insertStageSettings(4, "Last Stage")
    surfaces.insertSurface(4, nil)

    expect(surfaces.surfaceCount()).toBe(4)
    expect(surfaces.getSurface(4)).not.toBeNil()
    expect(surfaces.getSurface(4)!.valid).toBe(true)
  })
})

describe("deleteSurface()", () => {
  test("removes surface and shifts remaining", () => {
    const s1 = surfaces.getSurface(1)!
    const s3 = surfaces.getSurface(3)!

    settings.removeStageSettings(2)
    surfaces.deleteSurface(2)

    expect(surfaces.surfaceCount()).toBe(2)
    expect(surfaces.getSurface(1)!.index).toBe(s1.index)
    expect(surfaces.getSurface(2)!.index).toBe(s3.index)
    expect(surfaces.getSurface(3)).toBeNil()
  })

  test("deletes first surface and shifts", () => {
    const s2 = surfaces.getSurface(2)!

    settings.removeStageSettings(1)
    surfaces.deleteSurface(1)

    expect(surfaces.surfaceCount()).toBe(2)
    expect(surfaces.getSurface(1)!.index).toBe(s2.index)
  })

  test("deletes last surface", () => {
    settings.removeStageSettings(3)
    surfaces.deleteSurface(3)

    expect(surfaces.surfaceCount()).toBe(2)
    expect(surfaces.getSurface(3)).toBeNil()
  })
})

describe("destroyAll()", () => {
  test("removes all surfaces from tracking", () => {
    surfaces.destroyAll()

    expect(surfaces.surfaceCount()).toBe(0)
    expect(surfaces.getSurface(1)).toBeNil()
    expect(surfaces.getSurface(2)).toBeNil()
    expect(surfaces.getSurface(3)).toBeNil()
  })
})

describe("surface name sync", () => {
  test("updates surface name when stage name changes", () => {
    const surface = surfaces.getSurface(1)!
    const originalName = surface.name

    settings.getStageSettings(1).name.set("Renamed Stage")

    expect(surface.name).not.toBe(originalName)
    expect(surface.name).toBe("stage TestProject/Renamed Stage")
  })

  test("updates all surface names when project name changes", () => {
    const s1 = surfaces.getSurface(1)!
    const s2 = surfaces.getSurface(2)!

    settings.projectName.set("New Project Name")

    expect(s1.name).toBe("stage New Project Name/Stage 1")
    expect(s2.name).toBe("stage New Project Name/Stage 2")
  })
})

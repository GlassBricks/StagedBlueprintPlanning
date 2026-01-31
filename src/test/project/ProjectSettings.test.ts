import expect from "tstl-expect"
import { ProjectSettings } from "../../project/ProjectSettings"
import { getDefaultSurfaceSettings, SpacePlatformSettings } from "../../project/surfaces"

let settings: ProjectSettings
before_each(() => {
  settings = new ProjectSettings("TestProject", getDefaultSurfaceSettings())
})

test("constructor initializes properties correctly", () => {
  expect(settings.projectName.get()).toBe("TestProject")
  expect(settings.landfillTile.get()).toBe("landfill")
  expect(settings.stagedTilesEnabled.get()).toBe(false) // disabled in test
  expect(settings.stageCount()).toBe(0)
  expect(settings.isSpacePlatform()).toBe(false)
})

test("stageCount() returns correct count", () => {
  expect(settings.stageCount()).toBe(0)
  settings.insertStageSettings(1, "Stage 1")
  expect(settings.stageCount()).toBe(1)
  settings.insertStageSettings(2, "Stage 2")
  expect(settings.stageCount()).toBe(2)
})

test("getStageName() returns correct value", () => {
  settings.insertStageSettings(1, "Stage 1")
  settings.insertStageSettings(2, "Stage 2")
  expect(settings.getStageName(1)).toBe("Stage 1")
  expect(settings.getStageName(2)).toBe("Stage 2")
})

test("getStageSettings().name returns mutable property", () => {
  settings.insertStageSettings(1, "Stage 1")
  const prop = settings.getStageSettings(1).name
  expect(prop.get()).toBe("Stage 1")
  prop.set("Renamed")
  expect(settings.getStageName(1)).toBe("Renamed")
})

test("getStageSettings() returns blueprint override and stage settings", () => {
  settings.insertStageSettings(1, "Stage 1")
  const stageSettings = settings.getStageSettings(1)
  expect(stageSettings.blueprintOverrideSettings).not.toBeNil()
  expect(stageSettings.stageBlueprintSettings).not.toBeNil()
})

describe("insertStageSettings()", () => {
  test("inserts at beginning", () => {
    settings.insertStageSettings(1, "Stage 1")
    settings.insertStageSettings(2, "Stage 2")
    settings.insertStageSettings(1, "New First")
    expect(settings.stageCount()).toBe(3)
    expect(settings.getStageName(1)).toBe("New First")
    expect(settings.getStageName(2)).toBe("Stage 1")
    expect(settings.getStageName(3)).toBe("Stage 2")
  })

  test("inserts in middle", () => {
    settings.insertStageSettings(1, "Stage 1")
    settings.insertStageSettings(2, "Stage 2")
    settings.insertStageSettings(2, "Middle")
    expect(settings.getStageName(1)).toBe("Stage 1")
    expect(settings.getStageName(2)).toBe("Middle")
    expect(settings.getStageName(3)).toBe("Stage 2")
  })
})

describe("removeStageSettings()", () => {
  test("removes entry and shifts", () => {
    settings.insertStageSettings(1, "Stage 1")
    settings.insertStageSettings(2, "Stage 2")
    settings.insertStageSettings(3, "Stage 3")
    settings.removeStageSettings(2)
    expect(settings.stageCount()).toBe(2)
    expect(settings.getStageName(1)).toBe("Stage 1")
    expect(settings.getStageName(2)).toBe("Stage 3")
  })
})

describe("displayName()", () => {
  test("returns name when non-empty", () => {
    const display = settings.displayName(1)
    expect(display.get()).toBe("TestProject")
  })

  test("returns localized placeholder when empty", () => {
    const emptySettings = new ProjectSettings("", getDefaultSurfaceSettings())
    const display = emptySettings.displayName(1)
    const result = display.get() as unknown[]
    expect(result[0]).not.toBeNil()
  })
})

describe("isSpacePlatform()", () => {
  test("returns false for normal settings", () => {
    expect(settings.isSpacePlatform()).toBe(false)
  })

  test("returns true for space platform settings", () => {
    const spacePlatformSettings: SpacePlatformSettings = {
      type: "spacePlatform",
      starterPack: { name: "space-platform-starter-pack", quality: "normal" },
    }
    const spaceSettings = new ProjectSettings("Space", spacePlatformSettings)
    expect(spaceSettings.isSpacePlatform()).toBe(true)
    expect(spaceSettings.stagedTilesEnabled.get()).toBe(true)
    expect(spaceSettings.landfillTile.get()).toBe("space-platform-foundation")
  })
})

describe("getNewStageName()", () => {
  before_each(() => {
    settings.insertStageSettings(1, "Stage 1")
    settings.insertStageSettings(2, "Stage 2")
  })

  describe("first stage", () => {
    test("returns 'New Stage' if no naming convention", () => {
      settings.getStageSettings(1).name.set("Foo")
      expect(settings.getNewStageName(1)).toBe("New Stage")
    })

    test("returns next number minus 1 if numbered naming convention", () => {
      settings.getStageSettings(1).name.set("Foo 1")
      expect(settings.getNewStageName(1)).toBe("Foo 0")
    })
  })

  describe("other stages", () => {
    test("adds ' 1' if no naming convention", () => {
      settings.getStageSettings(1).name.set("Foo")
      expect(settings.getNewStageName(2)).toBe("Foo 1")
    })

    test("increments number if numbered naming convention", () => {
      settings.getStageSettings(1).name.set("Foo 1")
      expect(settings.getNewStageName(2)).toBe("Foo 2")
    })

    test("adds '.1' if numbered naming convention but next stage already has that name", () => {
      settings.getStageSettings(1).name.set("Foo 3")
      settings.getStageSettings(2).name.set("Foo 4")
      expect(settings.getNewStageName(2)).toBe("Foo 3.1")
    })
  })
})

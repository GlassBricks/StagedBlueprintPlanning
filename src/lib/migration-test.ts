import { formatVersion, Migrations } from "./migration"
import {
  getMockGlobal,
  mockSetupInTest,
  simulateConfigChangedModUpdate,
  simulateModUpdated,
  simulateOnConfigurationChanged,
  simulateOnInit,
  simulateOnLoad,
} from "./setup-mock"

test("formatVersion", () => {
  assert.same("01.02.03", formatVersion("1.2.3"))
  assert.same("01.02.03", formatVersion("01.02.03"))
})

test.each<[string, string, boolean]>(
  [
    ["1.2.3", "1.2.4", true],
    ["1.2.3", "1.2.3", false],
    ["1.1.3", "1.2.2", true],
    ["1.2.3", "1.1.4", false],
    ["1.2.3", "2.1.0", true],
    ["2.1.0", "1.2.3", false],
  ],
  "versionStrLess: %s < %s => %s",
  (a, b, expected) => {
    assert.equal(expected, formatVersion(a) < formatVersion(b))
  },
)

declare const global: {
  oldVersion: string | undefined
}
describe("Migrations", () => {
  let run: string[]
  before_each(() => {
    run = []
    mockSetupInTest()
  })

  test("sets oldVersion to current on_init", () => {
    simulateOnInit()
    assert.equal(script.active_mods[script.mod_name], global.oldVersion)
  })

  test("sets oldVersion to current on_config_changed", () => {
    simulateOnConfigurationChanged({
      migration_applied: false,
      mod_changes: {},
      mod_startup_settings_changed: false,
    })
    assert.equal(script.active_mods[script.mod_name], global.oldVersion)
  })

  function simulateUpdate() {
    simulateModUpdated("1.2.3", "1.2.5")
  }

  describe("from", () => {
    before_each(() => {
      for (const version of ["1.2.5", "1.2.4", "1.2.3"]) {
        Migrations.from(version, () => {
          run.push(version)
        })
      }
      getMockGlobal().oldVersion = "1.2.3"
    })

    test("does not run on_init", () => {
      simulateOnInit()
      assert.same([], run)
    })
    test("only runs later versions on config changed, in sorted order", () => {
      simulateUpdate()
      assert.same(["1.2.4", "1.2.5"], run)
    })
    test("runs all if oldVersion is undefined, in sorted order", () => {
      getMockGlobal().oldVersion = undefined
      simulateUpdate()
      assert.same(["1.2.3", "1.2.4", "1.2.5"], run)
    })
  })

  describe("since", () => {
    before_each(() => {
      for (const version of ["1.2.5", "1.2.4", "1.2.3"]) {
        Migrations.since(version, () => {
          run.push(version)
        })
      }
      getMockGlobal().oldVersion = "1.2.3"
    })
    test("runs all on_init in given order", () => {
      simulateOnInit()
      assert.same(["1.2.5", "1.2.4", "1.2.3"], run)
    })
    test("only runs later versions on config changed in sorted order", () => {
      simulateUpdate()
      assert.same(["1.2.4", "1.2.5"], run)
    })
  })

  describe("onLoadOrMigrate", () => {
    before_each(() => {
      Migrations.fromBeforeLoad("1.2.3", () => {
        run.push("fromBeforeLoad")
      })
      Migrations.onLoadOrMigrate(() => {
        run.push("onLoadOrMigrate")
      })
    })
    test("does nothing on_init", () => {
      simulateOnInit()
      assert.same([], run)
    })
    test("runs on_load if no migrations", () => {
      getMockGlobal().oldVersion = "1.2.3"
      simulateOnLoad()
      assert.same(["onLoadOrMigrate"], run)
    })
    test("only runs after if there are migrations", () => {
      getMockGlobal().oldVersion = "1.2.0"
      simulateOnLoad()
      assert.same([], run)
      simulateConfigChangedModUpdate("1.2.0", "1.2.3")
      assert.same(["fromBeforeLoad", "onLoadOrMigrate"], run)
    })
    test("normal migrations run after on_load", () => {
      Migrations.from("1.2.3", () => {
        run.push("from")
      })
      getMockGlobal().oldVersion = "1.2.0"
      simulateOnLoad()
      assert.same([], run)
      simulateConfigChangedModUpdate("1.2.0", "1.2.3")
      assert.same(["fromBeforeLoad", "onLoadOrMigrate", "from"], run)
    })
  })
})

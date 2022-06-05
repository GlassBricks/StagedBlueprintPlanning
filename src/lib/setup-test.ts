import { addSetupHook } from "./setup"
import {
  _endSetupMock,
  getMockGlobal,
  mockSetupInTest,
  simulateOnConfigurationChanged,
  simulateOnInit,
  simulateOnLoad,
  simulateReload,
} from "./setup-mock"

let actions: string[] = []
before_each(() => {
  actions = []
})

declare const global: any
let oldGame: LuaGameScript
let oldScript: LuaBootstrap
let oldGlobal: unknown
before_all(() => {
  oldGame = game
  oldScript = script
  oldGlobal = global
})

let setupHookCalled = false
addSetupHook(() => {
  setupHookCalled = true
  assert.is_nil(global)
  assert.is_nil(game)
  assert.not_equal(oldScript, script)
})

let setupRestored = false
addSetupHook({
  reset: () => "store",
  restore(value) {
    setupRestored = value === "store"
  },
})

test("setup hook called during mock", () => {
  setupHookCalled = false
  mockSetupInTest()
  assert.true(setupHookCalled)
  _endSetupMock()
  assert.true(setupRestored)
})

test("script, game, global mocked on setup", () => {
  mockSetupInTest()
  assert.not_equal(oldScript, script)
  assert.is_nil(game)
  assert.is_nil(global)
  after_test(() => {
    assert.equal(oldScript, script)
    assert.equal(oldGame, game)
    assert.equal(oldGlobal, global)
  })
})

test("on_init mock", () => {
  mockSetupInTest()
  script.on_init(() => {
    assert.not_nil(global)
    assert.not_equal(oldGlobal, global)
    assert.equal(game, oldGame)
    actions.push("on_init")
  })
  assert.same([], actions)
  simulateOnInit()
  assert.same(["on_init"], actions)
})

test("on_load mock", () => {
  mockSetupInTest()
  script.on_load(() => {
    assert.not_nil(global)
    assert.not_equal(oldGlobal, global)
    assert.is_nil(game) // no game during on_load
    actions.push("on_load")
  })
  assert.same([], actions)
  simulateOnLoad()
  assert.same(["on_load"], actions)
  assert.same(game, oldGame)
})

test("reload mock", () => {
  mockSetupInTest()
  simulateOnInit()
  const table = setmetatable({ foo: "bar" }, {})
  global.foo = table

  simulateReload()
  assert.is_nil(game)
  assert.is_nil(global)

  const newGlobal = getMockGlobal()
  // global
  assert.not_equal(table, newGlobal.foo)
  assert.same(table, newGlobal.foo)
  assert.is_nil(getmetatable(newGlobal.foo))
})

test("error when changed on_load", () => {
  mockSetupInTest()
  script.on_init(() => {
    global.foo = "foo"
  })
  script.on_load(() => {
    global.foo = "bar"
  })
  simulateOnInit()
  assert.error(simulateOnLoad)
})

test("on_configuration_changed mock", () => {
  mockSetupInTest()
  script.on_configuration_changed(() => {
    assert.not_nil(global)
    assert.not_equal(oldGlobal, global)
    assert.same(game, oldGame)
    actions.push("on_configuration_changed")
  })
  assert.same([], actions)
  simulateOnConfigurationChanged({
    migration_applied: false,
    mod_changes: {},
    mod_startup_settings_changed: false,
  })
  assert.same(["on_configuration_changed"], actions)
})

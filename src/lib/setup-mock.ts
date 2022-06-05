import { _getSetupHooks, _setInSetupMock, SetupHook } from "./setup"
import { deepCopy } from "./util"

/** @noSelf */
export interface MockScript extends LuaBootstrap {
  simulateOnInit(): void
  simulateReload(): void
  simulateOnLoad(): void
  simulateOnConfigurationChanged(data: ConfigurationChangedData): void
  getMockGlobal(): any
  revert(): void
  _isMockSetup: true
}

declare const global: unknown
function MockSetup(): MockScript {
  if (rawget(script as MockScript, "_isMockSetup")) error("Already in mock setup.")
  log("Mocking setup")
  const oldScript = script
  const oldGame = game
  const oldGlobal = global
  let mockGlobal = {}

  function cannotRunInMock(): never {
    error("This function cannot be run in mock setup mode.")
  }
  let onInitHook: (() => void) | undefined
  let onLoadHook: (() => void) | undefined
  let onConfigChangedHook: ((data: ConfigurationChangedData) => void) | undefined

  const resets: {
    hook: SetupHook<any>
    storedValue: any
  }[] = []
  const result: MockScript = {
    active_mods: oldScript.active_mods,
    level: oldScript.level,
    mod_name: oldScript.mod_name,
    object_name: "LuaBootstrap",
    generate_event_name: cannotRunInMock,
    get_event_filter: oldScript.get_event_filter,
    get_event_handler: oldScript.get_event_handler,
    get_event_order: oldScript.get_event_order,

    on_event: cannotRunInMock,
    on_nth_tick: cannotRunInMock,
    raise_biter_base_built: cannotRunInMock,
    raise_console_chat: cannotRunInMock,
    raise_event: cannotRunInMock,
    raise_market_item_purchased: cannotRunInMock,
    raise_player_crafted_item: cannotRunInMock,
    raise_player_fast_transferred: cannotRunInMock,
    raise_script_built: cannotRunInMock,
    raise_script_destroy: cannotRunInMock,
    raise_script_revive: cannotRunInMock,
    raise_script_set_tiles: cannotRunInMock,
    register_on_entity_destroyed: cannotRunInMock,
    set_event_filter: cannotRunInMock,
    getMockGlobal: () => mockGlobal,
    on_init(f: (() => void) | undefined) {
      onInitHook = f
    },
    on_load(f: (() => void) | undefined): void {
      onLoadHook = f
    },
    on_configuration_changed(f: ((param1: ConfigurationChangedData) => void) | undefined): void {
      onConfigChangedHook = f
    },
    simulateOnInit(): void {
      ;(_G as any).game = oldGame
      ;(_G as any).global = mockGlobal
      onInitHook?.()
    },
    simulateReload() {
      ;(_G as any).global = undefined
      ;(_G as any).game = undefined
      mockGlobal = deepCopy(mockGlobal)
    },
    simulateOnLoad(): void {
      ;(_G as any).global = mockGlobal
      ;(_G as any).game = undefined
      const oldGlobal = deepCopy(mockGlobal)
      onLoadHook?.()
      ;(_G as any).game = oldGame // AFTER onLoadHook
      collectgarbage()
      assert.same(oldGlobal, mockGlobal, "global modified in on_load!")
    },
    simulateOnConfigurationChanged(data: ConfigurationChangedData): void {
      ;(_G as any).game = oldGame
      ;(_G as any).global = mockGlobal
      onConfigChangedHook?.(data)
    },
    revert() {
      ;(_G as any).script = oldScript
      ;(_G as any).game = oldGame
      ;(_G as any).global = oldGlobal
      _setInSetupMock(false)
      for (const { hook, storedValue } of resets) {
        hook.restore!.call(hook, storedValue)
      }
    },
    _isMockSetup: true,
  }
  ;(_G as any).global = undefined
  ;(_G as any).script = result
  ;(_G as any).game = undefined
  _setInSetupMock(true)
  for (const hook of _getSetupHooks()) {
    const storedValue = hook.reset()
    if (hook.restore) {
      resets.push({ hook, storedValue })
    }
  }
  return result
}

export function _endSetupMock(): void {
  if (!rawget(script as MockScript, "_isMockSetup")) return
  ;(script as MockScript).revert()
}

export function mockSetupInTest(): void {
  after_test(_endSetupMock)
  MockSetup()
}

function getMockScript(): MockScript {
  const s = script as MockScript
  if (!rawget(s, "_isMockSetup")) error("Not in mock setup.")
  return s
}

export function simulateOnInit(): void {
  getMockScript().simulateOnInit()
}

export function simulateReload(): void {
  getMockScript().simulateReload()
}

export function simulateFullReload(): void {
  const script = getMockScript()
  script.simulateReload()
  script.simulateOnLoad()
}

export function simulateOnLoad(): void {
  getMockScript().simulateOnLoad()
}

export function simulateOnConfigurationChanged(data: ConfigurationChangedData): void {
  getMockScript().simulateOnConfigurationChanged(data)
}

export function simulateConfigChangedModUpdate(fromVersion: string, toVersion: string): void {
  const script = getMockScript()
  script.simulateOnConfigurationChanged({
    mod_changes: {
      [script.mod_name]: {
        old_version: fromVersion,
        new_version: toVersion,
      },
    },
    migration_applied: false,
    mod_startup_settings_changed: false,
  })
}

export function getMockGlobal(): any {
  return getMockScript().getMockGlobal()
}

export function simulateModUpdated(fromVersion: string, toVersion: string): void {
  const script = getMockScript()
  script.simulateOnLoad()
  simulateConfigChangedModUpdate(fromVersion, toVersion)
}

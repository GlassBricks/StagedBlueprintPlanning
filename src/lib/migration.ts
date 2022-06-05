import Events from "./Events"
import { addSetupHook } from "./setup"

export type VersionString = string & {
  _versionStringBrand: void
}

export function formatVersion(version: string): VersionString {
  const parts: string[] = []
  for (const [v] of string.gmatch(version, "%d+")) {
    parts.push(string.format("%02d", v))
  }
  return parts.join(".") as VersionString
}

declare const global: {
  oldVersion: string | undefined
}

export namespace Migrations {
  let preLoadMigrations: Record<VersionString, (() => void)[]> = {}
  let postLoadMigrations: Record<VersionString, (() => void)[]> = {}

  let preLoadFuncs: (() => void)[] | undefined
  let loadFuncs: (() => void)[] = []
  // postLoadFuncs not stored

  function init() {
    preLoadMigrations = {}
    postLoadMigrations = {}
    loadFuncs = []
    preLoadFuncs = undefined
    Events.on_configuration_changed(() => {
      const oldVersion = global.oldVersion
      if (preparePreLoadMigrations(oldVersion)) {
        for (const func of preLoadFuncs!) func()
      }
      preLoadFuncs = undefined
      for (const func of loadFuncs) func()
      loadFuncs = []
      for (const func of getMigrationsToRun(oldVersion, postLoadMigrations)) func()

      global.oldVersion = script.active_mods[script.mod_name]
    })

    Events.on_init(() => {
      global.oldVersion = script.active_mods[script.mod_name]
    })
  }
  init()
  addSetupHook(init)

  export function from(version: string, func: () => void): void {
    ;(postLoadMigrations[formatVersion(version)] ||= []).push(func)
  }

  export function since(version: string, func: () => void): void {
    Events.on_init(func)
    from(version, func)
  }

  export function onLoadOrMigrate(func: () => void): void {
    Events.on_load(() => {
      if (!preparePreLoadMigrations(global.oldVersion)) {
        func()
      } else {
        loadFuncs.push(func)
      }
    })
  }

  export function fromBeforeLoad(version: string, func: () => void): void {
    ;(preLoadMigrations[formatVersion(version)] ||= []).push(func)
  }

  function getMigrationsToRun(
    oldVersion: string | undefined,
    migrations: Record<VersionString, (() => void)[]>,
  ): (() => void)[] {
    const formattedOldVersion = oldVersion && formatVersion(oldVersion)
    let versions = Object.keys(migrations) as VersionString[]
    if (formattedOldVersion) {
      versions = versions.filter((v) => formattedOldVersion < v)
    }
    table.sort(versions)
    return versions.flatMap((v) => migrations[v])
  }

  function preparePreLoadMigrations(oldVersion: string | undefined): boolean {
    preLoadFuncs ??= getMigrationsToRun(oldVersion, preLoadMigrations)
    return preLoadFuncs.length > 0
  }
}

import { Events } from "./Events"

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

export namespace Migrations {
  let migrations: Record<VersionString, (() => void)[]> = {}

  export function from(version: string, func: () => void): void {
    ;(migrations[formatVersion(version)] ||= []).push(func)
  }

  export function _prepareMock() {
    assert(game && script.active_mods.testorio, "should not mock until game loaded")
    migrations = {}
  }

  function getMigrationsToRun(oldVersion: string | undefined): (() => void)[] {
    const formattedOldVersion = oldVersion && formatVersion(oldVersion)
    let versions = Object.keys(migrations) as VersionString[]
    if (formattedOldVersion) {
      versions = versions.filter((v) => formattedOldVersion < v)
    }
    table.sort(versions)
    return versions.flatMap((v) => migrations[v])
  }
  export function _doMigrations(oldVersion: string) {
    const migrations = getMigrationsToRun(oldVersion)
    for (const fn of migrations) fn()
  }

  Events.on_configuration_changed((data) => {
    const thisChange = data.mod_changes[script.mod_name]
    if (!thisChange) return
    const oldVersion = thisChange.old_version
    if (oldVersion) _doMigrations(oldVersion)
  })
}

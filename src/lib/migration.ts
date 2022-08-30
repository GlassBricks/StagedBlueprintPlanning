/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

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
  /** Runs both during on_init and from an earlier version. */
  export function since(version: string, func: () => void): void {
    Events.on_init(func)
    from(version, func)
  }

  export function _prepareMock(): void {
    assert(game && script.active_mods.testorio, "should not mock until game loaded")
    migrations = {}
  }

  function getMigrationsToRun(oldVersion: string): (() => void)[] {
    const formattedOldVersion = formatVersion(oldVersion)
    return (Object.keys(migrations) as VersionString[])
      .filter((v) => formattedOldVersion < v)
      .sort()
      .flatMap((v) => migrations[v])
  }
  export function _doMigrations(oldVersion: string): void {
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

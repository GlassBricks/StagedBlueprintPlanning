/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { VersionString } from "factorio:common"
import { Events } from "./Events"

export function formatVersion(version: string): VersionString {
  const parts: string[] = []
  for (const [v] of string.gmatch(version, "%d+")) {
    parts.push(string.format("%02d", v))
  }
  return parts.join(".") as VersionString
}

interface MigrationWithPriority {
  prio: number
  version: VersionString
  order: number
  func: () => void
}

function lt(a: MigrationWithPriority, b: MigrationWithPriority): boolean {
  // prio, version string, order
  if (a.prio != b.prio) return a.prio < b.prio
  if (a.version != b.version) return a.version < b.version
  return a.order < b.order
}

export namespace Migrations {
  let order = 0
  // let migrations: Record<VersionString, (() => void)[]> = {}
  // let earlyMigrations: Record<VersionString, (() => void)[]> = {}
  let migrations: MigrationWithPriority[] = []

  /** Runs when migrating from a version earlier than the specified version. */
  export function to(version: VersionString, func: () => void): void {
    migrations.push({
      prio: 9,
      version: formatVersion(version),
      order: order++,
      func,
    })
  }
  /** Runs both during on_init and from an earlier version. */
  export function since(version: VersionString, func: () => void): void {
    Events.on_init(func)
    to(version, func)
  }

  export function early(version: VersionString, func: () => void): void {
    migrations.push({
      prio: 8,
      version: formatVersion(version),
      order: order++,
      func,
    })
  }

  export function priority(prio: number, version: VersionString, func: () => void): void {
    migrations.push({
      prio,
      version: formatVersion(version),
      order: order++,
      func,
    })
  }

  /** Runs during any migration from an earlier version. */
  export function fromAny(func: () => void): void {
    to(script.active_mods[script.mod_name]!, func)
  }

  export function _prepareMock(): void {
    assert(game && script.active_mods["factorio-test"], "should not mock until game loaded")
    migrations = []
  }

  export function doMigrations(oldVersion: VersionString): void {
    const formattedOldVersion = formatVersion(oldVersion)
    const availableMigrations = migrations.filter((m) => formattedOldVersion < m.version)
    if (availableMigrations.length == 0) return
    const allVersions = availableMigrations.map((m) => m.version)
    log("Running migrations for versions: " + allVersions.join(", "))
    table.sort(availableMigrations, lt)
    for (const migration of availableMigrations) migration.func()
  }

  // noinspection JSUnusedGlobalSymbols
  export function setMigrationsHook(): void {
    Events.on_configuration_changed((data) => {
      const thisChange = data.mod_changes[script.mod_name]
      if (!thisChange) return
      const oldVersion = thisChange.old_version
      if (oldVersion) doMigrations(oldVersion)
    })
  }
}

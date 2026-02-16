// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

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

  /** Runs both during on_init and from an earlier version. */
  export function since(version: VersionString, func: () => void): void {
    Events.on_init(func)
    to(version, func)
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
    table.sort(availableMigrations, lt)
    log(`Running ${availableMigrations.length} migrations from ${oldVersion}:`)
    for (const migration of availableMigrations) {
      const info = debug.getinfo(migration.func, "S")
      const source = info != nil ? `${info.short_src}:${info.linedefined}` : "unknown"
      log(`  prio: ${migration.prio} version: ${migration.version} at ${source}`)
      migration.func()
    }
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

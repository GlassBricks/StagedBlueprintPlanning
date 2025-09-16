// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

/** @beforeImports */
{
  pcall(require, "test.module-mock")
  // require("__debugadapter__/debugadapter.lua")
  $CURRENT_VERSION = script.active_mods[script.mod_name]!
}
declare global {
  let $CURRENT_VERSION: VersionString
}

import { VersionString } from "factorio:common"
import { Events } from "./lib"
import { formatVersion, Migrations } from "./lib/migration"
import "./project"
import "./ui"
import "./blueprints"

pcall(require, "test.test-init")

// note this handler runs last, so other files can do other migrations first
Events.on_configuration_changed((data) => {
  const thisChange = data.mod_changes[script.mod_name]
  if (!thisChange) return
  const oldVersion = thisChange.old_version
  if (!oldVersion) return
  if (formatVersion(oldVersion) < formatVersion("2.0.0")) {
    error(
      "Staged blueprint planning: sorry, migrations are not supported from versions before 2.0.0. " +
        "Consider exporting your blueprints first, then manually importing them after updating.",
    )
  }
  Migrations.doMigrations(oldVersion)
})

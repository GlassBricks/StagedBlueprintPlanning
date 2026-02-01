// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaItemStack } from "factorio:runtime"
import { getErrorWithStacktrace } from "../lib"
import { Project } from "../project/Project"
import { convertBookToProjectDataOnly } from "./from-blueprint-book"
import { importProjectDataOnly, ProjectExport } from "./project"

function doImport(fn: () => Project): Project | string {
  const [success, result] = xpcall(fn, getErrorWithStacktrace)
  if (success) {
    result.worldPresentation.rebuildAllStages()
    return result
  }
  const [msg, stacktrace] = result
  log(`Failed to import project: ${stacktrace}`)
  return `Failed to import project: ${tostring(msg)}\nPlease report this to the mod author if you think this is a bug.`
}

/**
 * On error, returns an error message.
 */
export function importProject(project: ProjectExport): Project | string {
  return doImport(() => importProjectDataOnly(project))
}

export function convertBookToProject(stack: LuaItemStack): Project | string {
  return doImport(() => convertBookToProjectDataOnly(stack))
}

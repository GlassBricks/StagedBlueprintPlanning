import { LuaItemStack } from "factorio:runtime"
import { getErrorWithStacktrace } from "../lib"
import { UserProject } from "../project/ProjectDef"
import { convertBookToProjectDataOnly } from "./from-blueprint-book"
import { ProjectExport, importProjectDataOnly } from "./project"

function doImport(fn: () => UserProject): UserProject | string {
  const [success, result] = xpcall(fn, getErrorWithStacktrace)
  if (success) {
    result.worldUpdates.rebuildAllStages()
    return result
  }
  const [msg, stacktrace] = result
  log(`Failed to import project: ${stacktrace}`)
  return `Failed to import project: ${tostring(msg)}\nPlease report this to the mod author if you think this is a bug.`
}

/**
 * On error, returns an error message.
 */
export function importProject(project: ProjectExport): UserProject | string {
  return doImport(() => importProjectDataOnly(project))
}

export function convertBookToProject(stack: LuaItemStack): UserProject | string {
  return doImport(() => convertBookToProjectDataOnly(stack))
}

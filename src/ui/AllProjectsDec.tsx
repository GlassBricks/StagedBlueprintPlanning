import { LuaPlayer } from "factorio:runtime"
import { destroy } from "../lib/factoriojsx"
import * as mod_gui from "mod-gui"

export const AllProjectsName = script.mod_name + ":all-projects"

export function closeAllProjects(player: LuaPlayer): void {
  destroy(mod_gui.get_frame_flow(player)[AllProjectsName])
}

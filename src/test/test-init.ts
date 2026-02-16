// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import * as mod_gui from "mod-gui"
import { Settings } from "../constants"
import { Events } from "../lib"
import { debugPrint, getLastDebugPrintCall } from "../lib/test/misc"
import { Project } from "../project/Project"
import { deleteAllFreeSurfaces } from "../project/surfaces"
import { pushUndo, UndoHandler } from "../project/actions"
import { createProject } from "../project/Project"
import { getProjectEntityOfEntity } from "../ui/entity-util"
import { teleportToProject } from "../ui/player-current-stage"

// better source map traceback
declare const ____lualib: {
  __TS__SourceMapTraceBack(this: void, fileName: string, sourceMap: SourceMap): void
}
interface SourceMap {
  [line: number]:
    | number
    | {
        line: number
        file: string
      }
}
{
  const oldSourceMapTraceBack = ____lualib.__TS__SourceMapTraceBack
  ____lualib.__TS__SourceMapTraceBack = function (fileName: string, sourceMap: SourceMap) {
    if (fileName.endsWith("-test.lua")) {
      const newFileName = fileName.slice(0, -9) + ".test.ts"
      for (const [k, v] of pairs(sourceMap)) {
        if (typeof v == "number") {
          sourceMap[k] = { file: newFileName, line: v }
        }
      }
    }
    oldSourceMapTraceBack(fileName, sourceMap)
  }
}

declare const storage: {
  printEvents?: boolean
}

Events.on_player_created((p) => {
  game.get_player(p.player_index)?.toggle_map_editor()
  game.tick_paused = false
})

if ("factorio-test" in script.active_mods) {
  require("@NoResolution:test.in-world-test-util")
  function reinit() {
    for (const obj of rendering.get_all_objects(script.mod_name)) {
      obj.destroy()
    }
    const inventories = game.get_script_inventories(script.mod_name)[script.mod_name]
    if (inventories != nil) inventories.forEach((x) => x.destroy())
    const oldGlobal = storage
    // global = {}
    for (const [, player] of game.players) {
      const { screen, left, center, relative } = player.gui
      for (const gui of [screen, left, mod_gui.get_button_flow(player), center, relative]) {
        if (!gui) continue
        for (const child of gui.children) {
          if (child.get_mod() == script.mod_name) {
            child.destroy()
          }
        }
      }
      player.get_main_inventory()?.clear()
      player.mod_settings[Settings.DeleteAtNextStage] = { value: false }
      player.mod_settings[Settings.UseBplibForBlueprintPaste] = { value: false }
    }
    for (const [, surface] of game.surfaces) {
      if (surface.index != 1) game.delete_surface(surface)
    }
    Events.raiseFakeEventNamed("on_init", nil!)
    storage.printEvents = oldGlobal.printEvents
  }

  commands.add_command("reinit", "", reinit)
  const tagBlacklist: string[] = []

  const testFiles = getProjectFilesMatchingRegex("\\.test\\.tsx?$")
  const testNames = testFiles.map((x) => string.gsub(x, "%.", "-")[0])
  testNames.push("test.misc-test")
  require("__factorio-test__/init")(testNames, {
    tag_blacklist: tagBlacklist,
    // test_pattern: "test/project/event%-handlers",
    load_luassert: false,
    before_test_run() {
      reinit()
      const force = game.forces.player
      force.enable_all_technologies()
      force.research_all_technologies()
      const player = game.players[1]
      if (player.controller_type != defines.controllers.editor) player.toggle_map_editor()

      deleteAllFreeSurfaces()
      getLastDebugPrintCall()
    },
    after_test_run() {
      // game.speed = __DebugAdapter ? 1 : 1 / 6
      const result = remote.call("factorio-test", "getResults") as {
        status?: "passed" | "failed" | "todo"
        skipped: number
      }
      const expectedSkipped = 3
      if (result.status == "passed" && result.skipped == expectedSkipped) {
        game.surfaces[1].clear()
        const player = game.players[1]
        player.gui.screen["factorio-test-test-gui"]?.destroy()

        deleteAllFreeSurfaces()

        const project = createProject("Test", 5)
        teleportToProject(player, project)

        setupManualTests(project)

        player.play_sound({ path: "utility/game_won" })

        player.cursor_stack?.clear()
        player.get_main_inventory()?.clear()
      }
    },
    log_passed_tests: false,
    sound_effects: true,
    // test_pattern: "integration%-test",
  } satisfies Partial<FactorioTest.Config>)
  if (__DebugAdapter && __DebugAdapter.breakpoint != nil) {
    tagBlacklist.push("after_mod_reload")
  }
}

function setupManualTests(_project: Project) {
  // const player = game.players[1]
  // function createEntityWithChanges() {
  //   const entity = createProjectEntityNoCopy(
  //     { name: "assembling-machine-1", recipe: "iron-gear-wheel" },
  //     Pos(0.5, 0.5),
  //     nil,
  //     2,
  //   )
  //   entity.applyUpgradeAtStage(3, "assembling-machine-2")
  //   entity._applyDiffAtStage(4, { recipe: "copper-cable" })
  //
  //   project.content.add(entity)
  //   updateWorldEntities(project, entity, 1, nil)
  //
  //   teleportToStage(player, project.getStage(4)!)
  //   player.opened = entity.getWorldEntity(4)
  // }
  //
  // createEntityWithChanges()
}

const TestUndo = UndoHandler<string>(
  "in-world-test",
  (player, data) => {
    player.print(`Test undo: ${data}`)
    return data
  },
  (player, data) => {
    player.print(`Test redo: ${data}`)
    return data
  },
)

commands.add_command("test-undo", "", (e) => {
  const player = game.player!
  const param = e.parameter ?? "no param"
  pushUndo(player, player.surface, TestUndo.createAction(param))
  player.print(`Setup undo with: ${param}`)
})

commands.add_command("print-held-bp-entities", "", () => {
  const player = game.player!
  const stack = player.cursor_stack
  if (!stack?.is_blueprint) return player.print("Not a blueprint")
  const bp = stack.get_blueprint_entities()!
  debugPrint(bp)
})

commands.add_command("print-hovered-entity-project", "", () => {
  const player = game.player!
  const entity = player.selected
  if (!entity) {
    player.print("No entity selected")
    return
  }

  const [, projEntity] = getProjectEntityOfEntity(entity)
  if (!projEntity) {
    player.print("No project entity found")
    return
  }
  debugPrint(projEntity)
})

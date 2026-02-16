// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, LuaPlayer, PlayerIndex, TextBoxGuiElement } from "factorio:runtime"
import { L_Game } from "../constants"
import { convertBookToProject, importProject } from "../import-export"
import { exportProject, ProjectExport } from "../import-export/project"
import { funcRef, ibind, RegisterClass } from "../lib"
import {
  Component,
  destroy,
  destroyOnClose,
  Element,
  FactorioJsx,
  RenderContext,
  renderNamed,
} from "../lib/factoriojsx"
import { HorizontalPusher, SimpleTitleBar } from "../lib/factoriojsx/components"
import { L_Gui, L_GuiProjectSettings } from "../locale"
import { Project } from "../project/Project"
import { teleportToProject } from "./player-current-stage"

interface ShowBlueprintProps {
  bookName: LocalisedString
  blueprintString: string
  title: L_GuiProjectSettings.BlueprintStringFor | L_GuiProjectSettings.ProjectStringFor
}

@RegisterClass("gui:ShowBlueprintString")
class ShowBlueprintString extends Component<ShowBlueprintProps> {
  render(props: ShowBlueprintProps): Element {
    const { bookName, blueprintString, title } = props
    return (
      <frame auto_center direction="vertical" on_gui_closed={funcRef(destroyOnClose)}>
        <SimpleTitleBar title={[title, bookName]} />
        <text-box
          word_wrap
          read_only
          styleMod={{ width: 400, height: 300 }}
          text={blueprintString}
          onCreate={(e) => {
            e.select_all()
            e.scroll_to_top()
          }}
        />
      </frame>
    )
  }
}

export function exportProjectToString(player: LuaPlayer, project: Project): void {
  const exported = exportProject(project)
  const result = prefix + helpers.encode_string(helpers.table_to_json(exported))
  if (!result) {
    player.print("Encoding to bp string failed!!")
  } else {
    showBlueprintString(
      player,
      L_GuiProjectSettings.ProjectStringFor,
      project.settings.displayName(project.id).get(),
      result,
    )
  }
}

@RegisterClass("gui:ImportBlueprintString")
export class ImportBlueprintString extends Component {
  private playerIndex!: PlayerIndex
  private textBox!: TextBoxGuiElement
  render(_: unknown, context: RenderContext): Element {
    this.playerIndex = context.playerIndex
    const player = game.get_player(this.playerIndex)!
    return (
      <frame
        auto_center
        direction="vertical"
        on_gui_closed={funcRef(destroyOnClose)}
        onCreate={(e) => (player.opened = e)}
      >
        <SimpleTitleBar title={[L_Gui.ImportProjectFromString]} />
        <text-box
          word_wrap
          styleMod={{ minimal_width: 400, height: 300 }}
          onCreate={(e) => {
            this.textBox = e
            e.select_all()
          }}
        />
        <flow direction="horizontal">
          <HorizontalPusher />
          <button caption={[L_Game.Import]} on_gui_click={ibind(this.import)} />
        </flow>
      </frame>
    )
  }

  private import() {
    if (!this.textBox.valid) return
    const player = game.players[this.playerIndex]
    const string = this.textBox.text
    if (!string) return
    const success = tryImportProjectFromStringUser(player, string)
    if (success) {
      destroy(this.textBox.parent)
    }
  }
}

const ShowBlueprintStringName = "bp100-show-blueprint-string"

export function showBlueprintString(
  player: LuaPlayer,
  title: L_GuiProjectSettings.BlueprintStringFor | L_GuiProjectSettings.ProjectStringFor,
  bookName: LocalisedString,
  blueprintString: string,
): void {
  player.opened = renderNamed(
    <ShowBlueprintString bookName={bookName} blueprintString={blueprintString} title={title} />,
    player.gui.screen,
    ShowBlueprintStringName,
  )
}

export function showImportBlueprintWindow(player: LuaPlayer): void {
  player.opened = renderNamed(<ImportBlueprintString />, player.gui.screen, "bp100-import-blueprint-string")
}

const prefix = "staged-blueprint-project:"
function tryImportProjectFromStringUser(player: LuaPlayer, str: string): boolean {
  let result: Project | nil | string
  if (str.startsWith(prefix)) {
    result = importProjectString(str.slice(prefix.length))
  } else if (str.startsWith("0")) {
    result = importProjectFromBook(str)
  }

  if (typeof result == "string") {
    player.print(result)
    return false
  } else if (result == nil) {
    player.create_local_flying_text({ text: "Decoding string failed!", create_at_cursor: true })
    return false
  } else {
    teleportToProject(player, result)
    return true
  }
}

function importProjectString(str: string): Project | string {
  const json = helpers.decode_string(str)
  const table = json ? (helpers.json_to_table(json) as ProjectExport | nil) : nil
  if (!table) {
    return "Decoding string failed!"
  }
  return importProject(table)
}

function importProjectFromBook(str: string): Project | string {
  const inventory = game.create_inventory(1)
  try {
    const stack = inventory[0]
    const result = stack.import_stack(str)
    if (result == 1) return "Failed to import string to blueprint book!"
    return convertBookToProject(stack)
  } finally {
    inventory.destroy()
  }
}

/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LuaPlayer, OnGuiClickEvent, TableGuiElement } from "factorio:runtime"
import { createStageReference } from "../blueprints/stage-reference"
import { Sprites } from "../constants"
import { Events, ibind, RegisterClass, Subscription } from "../lib"
import {
  Component,
  destroy,
  destroyChildren,
  Element,
  FactorioJsx,
  RenderContext,
  renderMultiple,
  renderNamed,
} from "../lib/factoriojsx"
import { L_Gui } from "../locale"
import { UserProject } from "../project/ProjectDef"

@RegisterClass("gui:StageReferencePanel")
class StageReferencePanel extends Component<{
  project: UserProject
}> {
  private project!: UserProject
  private subscription!: Subscription
  private element!: TableGuiElement
  override render(
    props: {
      project: UserProject
    },
    context: RenderContext,
  ): Element {
    this.project = props.project
    this.subscription = context.getSubscription()
    this.project.localEvents.subscribe(this.subscription, ibind(this.setup))
    context.onMount(() => this.setup())
    return (
      <frame
        anchor={{
          gui: defines.relative_gui_type.blueprint_book_gui,
          position: defines.relative_gui_position.right,
        }}
        caption={[L_Gui.GetStageTemplate]}
      >
        <frame
          style="inside_shallow_frame"
          styleMod={{
            padding: 10,
          }}
        >
          <scroll-pane>
            <table
              column_count={2}
              onCreate={(e) => (this.element = e)}
              styleMod={{
                horizontal_spacing: 10,
              }}
            />
          </scroll-pane>
        </frame>
      </frame>
    )
  }

  private setup() {
    const table = this.element
    destroyChildren(table)
    for (const stage of this.project.getAllStages()) {
      renderMultiple(
        <>
          <label caption={stage.name} styleMod={{ width: 80 }} />
          <sprite-button
            style="frame_action_button"
            sprite={Sprites.NewBlueprint}
            tags={{ stage: stage.stageNumber }}
            on_gui_click={ibind(this.newBlueprintRef)}
          />
        </>,
        table,
      )
    }
  }

  private newBlueprintRef(e: OnGuiClickEvent) {
    const stageNum = tonumber(e.element.tags.stage)
    if (!stageNum) return
    const stage = this.project.getStage(stageNum)
    if (!stage) return

    const player = game.get_player(e.player_index)
    if (!player || !player.cursor_stack || !player.clear_cursor()) return

    if (createStageReference(player.cursor_stack, stage)) player.cursor_stack_temporary = true
  }
}

const stageReferenceBoxName = "bp100_stage-reference-box"
export function renderStageReferencePanel(player: LuaPlayer, project: UserProject): void {
  renderNamed(<StageReferencePanel project={project} />, player.gui.relative, stageReferenceBoxName)
}

Events.on_gui_closed((e) => {
  if (!e.item) return
  const player = game.get_player(e.player_index)
  if (!player) return
  destroy(player.gui.relative[stageReferenceBoxName])
})

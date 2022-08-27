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

import { Assembly, LocalAssemblyEvent, Stage } from "../../assembly/AssemblyDef"
import { AssemblyOperations } from "../../assembly/AssemblyOperations"
import { assertNever, funcOn, RegisterClass } from "../../lib"
import { Component, destroy, FactorioJsx, renderNamed, Spec, Tracker } from "../../lib/factoriojsx"
import { TrashButton } from "../../lib/factoriojsx/components/buttons"
import { showDialog } from "../../lib/factoriojsx/components/Dialog"
import { Fn } from "../../lib/factoriojsx/components/Fn"
import { HorizontalPusher } from "../../lib/factoriojsx/components/misc"
import { SimpleTitleBar } from "../../lib/factoriojsx/components/TitleBar"
import { Pos } from "../../lib/geometry"
import { state } from "../../lib/observable"
import { L_GuiAssemblySettings } from "../../locale"
import { teleportToStage, teleportToSurface1 } from "../player-position"
import { ItemRename } from "./ItemRename"
import { StageSelector } from "./StageSelector"

declare global {
  interface PlayerData {
    currentAssemblySettings?: AssemblySettings
  }
}
declare const global: GlobalWithPlayers

const stageListBoxHeight = 28 * 12
const stageListBoxWidth = 150
const stageSettingsWidth = 300

@RegisterClass("gui:AssemblySettings")
export class AssemblySettings extends Component<{ assembly: Assembly }> {
  assembly!: Assembly
  playerIndex!: PlayerIndex
  element!: LuaGuiElement

  private selectedStage = state(0)
  public override render(props: { assembly: Assembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.playerIndex = tracker.playerIndex

    global.players[this.playerIndex].currentAssemblySettings = this
    tracker.onMount((e) => {
      this.element = e
      e.bring_to_front()
    })
    tracker.getSubscription().add(funcOn(this.onDestroyed))

    this.assembly.localEvents.subscribe(tracker.getSubscription(), funcOn(this.onAssemblyEvent))

    return (
      <frame direction="vertical">
        <SimpleTitleBar title={[L_GuiAssemblySettings.Title]} onClose={funcOn(this.onClose)} />

        <frame style="inside_shallow_frame" direction="vertical">
          <frame style="subheader_frame" direction="horizontal">
            <ItemRename
              name={this.assembly.name}
              displayName={this.assembly.displayName}
              renameTooltip={[L_GuiAssemblySettings.RenameAssembly]}
            />
            <HorizontalPusher />
            <TrashButton tooltip={[L_GuiAssemblySettings.DeleteAssembly]} on_gui_click={funcOn(this.beginDelete)} />
          </frame>
          <flow
            direction="horizontal"
            styleMod={{
              padding: [5, 10],
              vertical_align: "center",
            }}
          >
            <label
              style="caption_label"
              caption={[L_GuiAssemblySettings.NewStage]}
              styleMod={{
                right_margin: 10,
              }}
            />
            <button
              caption={[L_GuiAssemblySettings.AfterCurrent]}
              enabled={this.selectedStage.gt(0)}
              on_gui_click={funcOn(this.newStageAfter)}
            />
            <button caption={[L_GuiAssemblySettings.AtFront]} on_gui_click={funcOn(this.newStageAtFront)} />
          </flow>
        </frame>
        <flow
          direction="horizontal"
          styleMod={{
            horizontal_spacing: 12,
          }}
        >
          <StageSelector
            uses="list-box"
            styleMod={{
              height: stageListBoxHeight,
              width: stageListBoxWidth,
            }}
            assembly={this.assembly}
            selectedIndex={this.selectedStage}
          />

          <Fn
            uses="frame"
            from={this.selectedStage}
            map={funcOn(this.renderStageSettings)}
            direction="vertical"
            style="inside_shallow_frame"
            styleMod={{
              width: stageSettingsWidth,
              vertically_stretchable: true,
            }}
          />
        </flow>
      </frame>
    )
  }

  private onDestroyed() {
    delete global.players[this.playerIndex].currentAssemblySettings
  }

  private onClose() {
    this.element.visible = false
  }

  private onAssemblyEvent(_: any, event: LocalAssemblyEvent) {
    if (event.type === "assembly-deleted") {
      destroy(this.element)
    } else if (event.type !== "stage-added" && event.type !== "pre-stage-deleted" && event.type !== "stage-deleted") {
      assertNever(event)
    }
  }

  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    showDialog(player, {
      title: [L_GuiAssemblySettings.DeleteAssembly],
      message: [
        [L_GuiAssemblySettings.DeleteAssemblyConfirmation1, this.assembly.displayName.get()],
        [L_GuiAssemblySettings.DeleteAssemblyConfirmation2],
        [L_GuiAssemblySettings.DeleteAssemblyConfirmation3],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: funcOn(this.deleteAssembly),
    })
  }

  private deleteAssembly() {
    this.assembly.delete()
    teleportToSurface1(game.get_player(this.playerIndex)!)
  }

  private newStageAfter() {
    this.insertStage(this.selectedStage.get() + 1)
  }

  private newStageAtFront() {
    this.insertStage(1)
  }

  private insertStage(index: number) {
    if (!this.assembly.valid) return
    const stage = this.assembly.insertStage(index)
    teleportToStage(game.get_player(this.playerIndex)!, stage)
  }

  private renderStageSettings(selectedStageIndex: number): Spec | nil {
    const stage = this.assembly.getStage(selectedStageIndex)
    if (!stage) return nil
    return <StageSettings stage={stage} />
  }
}

@RegisterClass("gui:StageSettings")
export class StageSettings extends Component<{ stage: Stage }> {
  playerIndex!: PlayerIndex
  stage!: Stage
  public override render(props: { stage: Stage }, tracker: Tracker): Spec {
    this.stage = props.stage
    this.playerIndex = tracker.playerIndex

    const canDeleteStage = this.stage.stageNumber > 1

    return (
      <>
        <frame style="subheader_frame" direction="horizontal">
          <ItemRename
            name={props.stage.name}
            displayName={props.stage.name}
            renameTooltip={[L_GuiAssemblySettings.RenameStage]}
          />
          <HorizontalPusher />
          <TrashButton
            enabled={canDeleteStage}
            tooltip={
              canDeleteStage ? [L_GuiAssemblySettings.DeleteStage] : [L_GuiAssemblySettings.CannotDeleteFirstStage]
            }
            on_gui_click={funcOn(this.beginDelete)}
          />
        </frame>
        <scroll-pane
          style="naked_scroll_pane"
          styleMod={{
            padding: [5, 10],
            vertically_stretchable: true,
            horizontally_stretchable: true,
          }}
          horizontal_scroll_policy="never"
        >
          <button
            caption={[L_GuiAssemblySettings.ResetStage]}
            tooltip={[L_GuiAssemblySettings.ResetStageTooltip]}
            on_gui_click={funcOn(this.resetStage)}
          />
          <label style="bold_label" caption={[L_GuiAssemblySettings.MoreSettingsComingSoon]} />
        </scroll-pane>
      </>
    )
  }

  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const stageNumber = this.stage.stageNumber
    if (stageNumber <= 1) return // can't delete the first stage
    const previousStage = this.stage.assembly.getStage(stageNumber - 1)
    if (!previousStage) return
    showDialog(player, {
      title: [L_GuiAssemblySettings.DeleteStage],
      message: [
        [L_GuiAssemblySettings.DeleteStageConfirmation1, this.stage.name.get()],
        [L_GuiAssemblySettings.DeleteStageConfirmation2, previousStage.name.get()],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: funcOn(this.deleteStage),
    })
  }
  private deleteStage() {
    const previousStage = this.stage.assembly.getStage(this.stage.stageNumber - 1)
    if (!previousStage) return
    this.stage.deleteInAssembly()
    teleportToStage(game.get_player(this.playerIndex)!, previousStage)
  }

  private resetStage() {
    AssemblyOperations.resetStage(this.stage.assembly, this.stage)
  }
}

const AssemblySettingsName = script.mod_name + ":AssemblySettings"
const defaultLocation = Pos(0, 400)
export function openAssemblySettings(player: LuaPlayer, assembly: Assembly): void {
  const existing = global.players[player.index].currentAssemblySettings
  const existingValid = existing && existing.element.valid
  if (existingValid && existing.assembly === assembly) {
    existing.element.visible = true
    existing.element.bring_to_front()
  } else {
    const location = existingValid ? existing.element.location : defaultLocation
    const element = renderNamed(
      <AssemblySettings assembly={assembly} />,
      player.gui.screen,
      AssemblySettingsName,
    ) as FrameGuiElement
    element.location = location
    element.bring_to_front()
  }
}

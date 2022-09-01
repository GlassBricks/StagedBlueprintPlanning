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
import { getStageToMerge } from "../../entity/AssemblyEntity"
import { funcOn, funcRef, onPlayerInit, RegisterClass, registerFunctions } from "../../lib"
import {
  Component,
  destroyChildren,
  FactorioJsx,
  renderMultiple,
  renderNamed,
  Spec,
  Tracker,
} from "../../lib/factoriojsx"
import { Fn, HorizontalPusher, showDialog, SimpleTitleBar, TrashButton } from "../../lib/factoriojsx/components"
import { L_GuiAssemblySettings } from "../../locale"
import {
  PlayerChangedStageEvent,
  playerCurrentStage,
  recordLastStagePosition,
  teleportToAssembly,
  teleportToStage,
  teleportToSurface1,
} from "../player-current-stage"
import { ItemRename } from "./ItemRename"
import { StageSelector } from "./StageSelector"

declare global {
  interface PlayerData {
    currentShownAssembly?: Assembly
  }
}
declare const global: GlobalWithPlayers

const stageListBoxHeight = 28 * 12
const stageListBoxWidth = 140
const stageSettingsWidth = 160

const insertButtonWidth = 100

@RegisterClass("gui:AssemblySettings")
export class AssemblySettings extends Component<{ assembly: Assembly }> {
  assembly!: Assembly
  playerIndex!: PlayerIndex

  public override render(props: { assembly: Assembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.playerIndex = tracker.playerIndex

    global.players[this.playerIndex].currentShownAssembly = this.assembly
    tracker.getSubscription().add(funcOn(this.onDestroyed))

    this.assembly.localEvents.subscribe(tracker.getSubscription(), funcOn(this.onAssemblyEvent))
    const currentStage = playerCurrentStage(this.playerIndex)

    return (
      <>
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
            <label style="caption_label" caption={[L_GuiAssemblySettings.NewStage]} styleMod={{ right_margin: 10 }} />
            <button
              styleMod={{ width: insertButtonWidth }}
              caption={[L_GuiAssemblySettings.AfterCurrent]}
              on_gui_click={funcOn(this.newStageAfter)}
            />
            <button
              styleMod={{ width: insertButtonWidth }}
              caption={[L_GuiAssemblySettings.AtFront]}
              on_gui_click={funcOn(this.newStageAtFront)}
            />
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
          />

          <Fn
            uses="frame"
            from={currentStage}
            map={funcOn(this.renderStageSettings)}
            direction="vertical"
            style="inside_shallow_frame"
            styleMod={{
              minimal_width: stageSettingsWidth,
              vertically_stretchable: true,
              horizontally_stretchable: true,
            }}
          />
        </flow>
      </>
    )
  }

  private onDestroyed() {
    delete global.players[this.playerIndex].currentShownAssembly
  }

  private onAssemblyEvent(event: LocalAssemblyEvent) {
    if (event.type === "assembly-deleted") {
      hideAssemblySettings(game.get_player(this.playerIndex)!)
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
    const currentStage = playerCurrentStage(this.playerIndex).get()
    if (!currentStage || currentStage.assembly !== this.assembly) return
    this.insertStage(currentStage.stageNumber + 1)
  }

  private newStageAtFront() {
    this.insertStage(1)
  }

  private insertStage(index: number) {
    if (!this.assembly.valid) return
    const stage = this.assembly.insertStage(index)
    teleportToStage(game.get_player(this.playerIndex)!, stage)
  }

  private renderStageSettings(stage: Stage | nil): Spec | nil {
    if (stage && stage.assembly === this.assembly) {
      return <StageSettings stage={stage} />
    }
    return nil
  }
}

@RegisterClass("gui:StageSettings")
export class StageSettings extends Component<{ stage: Stage }> {
  playerIndex!: PlayerIndex
  stage!: Stage
  public override render(props: { stage: Stage }, tracker: Tracker): Spec {
    this.stage = props.stage
    this.playerIndex = tracker.playerIndex

    return (
      <>
        <frame style="subheader_frame" direction="horizontal">
          <ItemRename
            name={props.stage.name}
            displayName={props.stage.name}
            renameTooltip={[L_GuiAssemblySettings.RenameStage]}
            maximalWidth={stageSettingsWidth - 35}
          />
          <HorizontalPusher />
        </frame>
        <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.ResetStage]}
            tooltip={[L_GuiAssemblySettings.ResetStageTooltip]}
            on_gui_click={funcOn(this.resetStage)}
          />
          <button
            style="red_button"
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.DeleteStage]}
            enabled={this.stage.assembly.numStages() > 1}
            on_gui_click={funcOn(this.beginDelete)}
          />
        </flow>
      </>
    )
  }

  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const { isFirst, toMerge } = this.getStageToMerge()
    if (!toMerge) return
    showDialog(player, {
      title: [L_GuiAssemblySettings.DeleteStage],
      message: [
        [L_GuiAssemblySettings.DeleteStageConfirmation1, this.stage.name.get()],
        [
          isFirst
            ? L_GuiAssemblySettings.DeleteStageConfirmation2First
            : L_GuiAssemblySettings.DeleteStageConfirmation2Middle,
          toMerge.name.get(),
        ],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: funcOn(this.deleteStage),
    })
  }
  private getStageToMerge() {
    const stageNumber = this.stage.stageNumber
    const isFirst = stageNumber === 1
    const toMerge = this.stage.assembly.getStage(getStageToMerge(stageNumber))
    return { isFirst, toMerge }
  }
  private deleteStage() {
    const { toMerge } = this.getStageToMerge()
    if (!toMerge) return
    const player = game.get_player(this.playerIndex)!
    recordLastStagePosition(player)
    this.stage.deleteInAssembly()
    teleportToStage(player, toMerge)
  }

  private resetStage() {
    AssemblyOperations.resetStage(this.stage.assembly, this.stage)
  }
}

const assemblySettingsHeight = stageListBoxHeight + 120
const assemblySettingsWidth = stageListBoxWidth + stageSettingsWidth + 30
function AssemblySettingsFrame() {
  return (
    <frame
      direction="vertical"
      styleMod={{
        minimal_width: assemblySettingsWidth,
        minimal_height: assemblySettingsHeight,
      }}
      location={{ x: 0, y: 350 }}
      visible={false}
    >
      <SimpleTitleBar title={[L_GuiAssemblySettings.Title]} onClose={funcRef(closeAssemblySettingsClick)} />
      <flow direction="vertical" name="content" />
    </frame>
  )
}

const AssemblySettingsFrameName = "gui:AssemblySettingsFrame"
onPlayerInit((index) => {
  const player = game.get_player(index)!
  getOrCreateFrame(player)
})
function getOrCreateFrame(player: LuaPlayer): FrameGuiElement {
  const screen = player.gui.screen
  const existing = screen[AssemblySettingsFrameName]
  if (existing) return existing as FrameGuiElement
  return renderNamed(<AssemblySettingsFrame />, screen, AssemblySettingsFrameName) as FrameGuiElement
}

function closeAssemblySettingsClick(event: OnGuiClickEvent) {
  const player = game.get_player(event.player_index)
  if (player) hideAssemblySettings(player)
}
registerFunctions("AssemblySettings", { closeAssemblySettingsClick })

function hideAssemblySettings(player: LuaPlayer): void {
  const frame = getOrCreateFrame(player)
  frame.visible = false
  destroyChildren(frame.content!)
}

/** Returns the frame if same assembly already open */
function showAssemblySettings(player: LuaPlayer, assembly: Assembly): FrameGuiElement | nil {
  const frame = getOrCreateFrame(player)
  frame.visible = true
  frame.bring_to_front()
  const currentAssembly = global.players[player.index].currentShownAssembly
  if (currentAssembly === assembly) {
    return frame
  }
  destroyChildren(frame.content!)
  renderMultiple(<AssemblySettings assembly={assembly} />, frame.content!)
}

export function openAssemblySettings(player: LuaPlayer, assembly: Assembly): void {
  const frame = showAssemblySettings(player, assembly)
  if (frame) frame.force_auto_center() // re-center if already open
  teleportToAssembly(player, assembly)
}

PlayerChangedStageEvent.addListener((player, stage) => {
  if (!stage) return
  const currentAssembly = global.players[player.index].currentShownAssembly
  if (currentAssembly !== stage.assembly) {
    showAssemblySettings(player, stage.assembly)
  }
})

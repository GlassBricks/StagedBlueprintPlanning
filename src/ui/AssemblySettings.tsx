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

import { Assembly, AutoSetTilesType, LocalAssemblyEvent, Stage } from "../assembly/AssemblyDef"
import { AssemblyOperations } from "../assembly/AssemblyOperations"
import { getStageToMerge } from "../entity/AssemblyEntity"
import { funcOn, funcRef, onPlayerInit, RegisterClass, registerFunctions } from "../lib"
import {
  Component,
  destroy,
  destroyChildren,
  FactorioJsx,
  renderMultiple,
  renderNamed,
  Spec,
  Tracker,
} from "../lib/factoriojsx"
import {
  Fn,
  HorizontalPusher,
  showDialog,
  SimpleTitleBar,
  TrashButton,
  VerticalPusher,
} from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiAssemblySettings, L_Interaction } from "../locale"
import { ItemRename } from "./ItemRename"
import {
  PlayerChangedStageEvent,
  playerCurrentStage,
  recordLastStagePosition,
  teleportToAssembly,
  teleportToStage,
  teleportToSurface1,
} from "./player-current-stage"
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
          <flow direction="vertical" styleMod={{ padding: [5, 10], vertical_spacing: 0 }}>
            <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
              <label style="caption_label" caption={[L_GuiAssemblySettings.NewStage]} />
              <HorizontalPusher />
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
            <line direction="vertical" />
          </flow>
        </frame>
        <flow
          direction="horizontal"
          styleMod={{
            top_margin: 3,
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
        <frame style="inside_shallow_frame_with_padding" direction="vertical">
          <flow direction="vertical">
            <button
              caption={[L_GuiAssemblySettings.GetBlueprintBook]}
              tooltip={[L_GuiAssemblySettings.GetBlueprintBookTooltip]}
              on_gui_click={funcOn(this.getBlueprintBook)}
            />
            <checkbox
              state={this.assembly.blueprintBookSettings.autoLandfill}
              caption={[L_GuiAssemblySettings.AutoLandfill]}
              tooltip={[L_GuiAssemblySettings.AutoLandfillDescription]}
            />
          </flow>
        </frame>
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

  private getBlueprintBook() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    if (!player.clear_cursor()) return
    const cursor = player.cursor_stack
    if (!cursor || !player.is_cursor_empty()) return
    if (!this.assembly.makeBlueprintBook(cursor)) {
      cursor.clear()
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintBookEmpty],
        create_at_cursor: true,
      })
    }
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
          <line direction="horizontal" />
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.GetBlueprint]}
            tooltip={[L_GuiAssemblySettings.GetBlueprintTooltip]}
            on_gui_click={funcOn(this.getBlueprint)}
          />
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.EditBlueprint]}
            tooltip={[L_GuiAssemblySettings.EditBlueprintTooltip]}
            on_gui_click={funcOn(this.editBlueprint)}
          />
          <line direction="horizontal" />
          <label style="caption_label" caption={[L_GuiAssemblySettings.SetTiles]} />
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.LabTiles]}
            on_gui_click={funcOn(this.setLabTiles)}
          />
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.LandfillAndWater]}
            on_gui_click={funcOn(this.setLandfillAndWater)}
          />
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.LandfillAndLab]}
            on_gui_click={funcOn(this.setLandfillAndLabTiles)}
          />
          <line direction="horizontal" />
          <VerticalPusher />
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

  private resetStage() {
    AssemblyOperations.resetStage(this.stage.assembly, this.stage)
  }

  private getBlueprint() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const cursorStack = player.cursor_stack
    if (!cursorStack) return
    const blueprint = this.stage.takeBlueprint()
    if (!blueprint) {
      return player.create_local_flying_text({
        text: [L_Interaction.BlueprintEmpty],
        create_at_cursor: true,
      })
    }
    if (player.clear_cursor()) {
      cursorStack.set_stack(blueprint)
    }
  }

  private editBlueprint() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    if (!this.stage.editBlueprint(player)) {
      return player.create_local_flying_text({
        text: [L_Interaction.BlueprintEmpty],
        create_at_cursor: true,
      })
    }
  }

  private setLabTiles() {
    this.trySetTiles(AutoSetTilesType.LabTiles)
  }

  private setLandfillAndWater() {
    this.trySetTiles(AutoSetTilesType.LandfillAndWater)
  }

  private setLandfillAndLabTiles() {
    this.trySetTiles(AutoSetTilesType.LandfillAndLabTiles)
  }

  private trySetTiles(type: AutoSetTilesType) {
    const success = this.stage.autoSetTiles(type)
    if (!success) {
      game.get_player(this.playerIndex)?.create_local_flying_text({
        text: [L_GuiAssemblySettings.FailedToSetTiles],
        create_at_cursor: true,
      })
    }
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
function destroyFrame(player: LuaPlayer) {
  destroy(player.gui.screen[AssemblySettingsFrameName])
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
  if (currentAssembly && currentAssembly !== stage.assembly) {
    showAssemblySettings(player, stage.assembly)
  }
})
function refreshCurrentAssembly() {
  for (const [, player] of game.players) {
    const currentAssembly = global.players[player.index].currentShownAssembly
    if (currentAssembly) {
      destroyFrame(player)
      showAssemblySettings(player, currentAssembly)
    }
  }
}
Migrations.fromAny(refreshCurrentAssembly)

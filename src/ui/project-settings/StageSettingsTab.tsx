// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PlayerIndex } from "factorio:runtime"
import { L_Game } from "../../constants"
import { getStageToMerge } from "../../entity/ProjectEntity"
import { bind, ibind, RegisterClass } from "../../lib"
import { Component, Element, FactorioJsx, RenderContext } from "../../lib/factoriojsx"
import { Fn, HorizontalPusher, HorizontalSpacer, showDialog } from "../../lib/factoriojsx/components"
import { L_GuiProjectSettings } from "../../locale"
import { Stage, Project } from "../../project/Project"
import { syncMapGenSettings } from "../../project/surfaces"
import { ItemRename } from "../ItemRename"
import { openMapGenSettingsSelect } from "../MapGenSettings"
import { playerCurrentStage, recordPlayerLastPosition, teleportToStage } from "../player-current-stage"
import { ProjectSettingsTabWidth, StageSettingsButtonWidth } from "./shared-constants"

@RegisterClass("gui:StageSettingsTab")
export class StageSettingsTab extends Component<{ project: Project }> {
  project!: Project
  playerIndex!: PlayerIndex

  override render(props: { project: Project }, context: RenderContext): Element {
    this.project = props.project
    this.playerIndex = context.playerIndex

    return (
      <Fn
        uses="frame"
        from={playerCurrentStage(this.playerIndex)}
        map={ibind(this.renderStageSettings)}
        direction="vertical"
        style="inside_shallow_frame"
        styleMod={{
          vertically_stretchable: true,
          horizontally_stretchable: true,
        }}
      />
    )
  }

  private renderStageSettings(stage: Stage | nil): Element | nil {
    if (stage && stage.project == this.project) {
      return this.stageSettingsContent(stage)
    }
    return nil
  }

  private stageSettingsContent(stage: Stage) {
    return (
      <>
        <frame style="subheader_frame" direction="horizontal" styleMod={{ horizontal_align: "center" }}>
          <ItemRename
            name={stage.getSettings().name}
            displayName={stage.getSettings().name}
            renameTooltip={[L_GuiProjectSettings.RenameStage]}
            maximalWidth={ProjectSettingsTabWidth - 30}
          />
          <HorizontalPusher />
        </frame>
        <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
          <flow>
            <button
              style="red_button"
              caption={[L_GuiProjectSettings.DiscardStage]}
              enabled={stage.project.settings.stageCount() > 1}
              on_gui_click={ibind(this.beginDiscard)}
            />
            <button
              style="red_button"
              caption={[L_GuiProjectSettings.MergeStage]}
              enabled={stage.stageNumber > 1}
              on_gui_click={ibind(this.beginMerge)}
            />
          </flow>
          <line />
          <label caption={[L_GuiProjectSettings.MapGenSettings]} style="caption_label" />
          <button
            caption={[L_GuiProjectSettings.SetMapGenSettingsFromPlanet]}
            tooltip={[L_GuiProjectSettings.SetMapGenSettingsFromPlanetTooltip]}
            on_gui_click={ibind(this.openMapGenSettingsSelect)}
          />
          <button
            caption={[L_GuiProjectSettings.SyncMapGenSettings]}
            tooltip={[L_GuiProjectSettings.SyncMapGenSettingsTooltip]}
            on_gui_click={ibind(this.syncMapGenSettings)}
          />
          <line />
          <label caption={[L_GuiProjectSettings.Tiles]} style="caption_label" />
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <checkbox
              state={this.project.settings.stagedTilesEnabled}
              caption={[L_GuiProjectSettings.EnableStagedTiles]}
              tooltip={[L_GuiProjectSettings.EnableStagedTilesTooltip]}
            />
            <HorizontalSpacer width={10} />
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiProjectSettings.ScanExistingTiles]}
              tooltip={[L_GuiProjectSettings.ScanExistingTilesTooltip]}
              enabled={this.project.settings.stagedTilesEnabled}
              on_gui_click={ibind(this.scanExistingTiles)}
            />
          </flow>
        </flow>
      </>
    )
  }

  private beginDiscard() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage) return
    showDialog(player, {
      title: [L_GuiProjectSettings.DiscardStage],
      message: [[L_GuiProjectSettings.DiscardStageConfirmation, stage.getSettings().name.get()]],
      redConfirm: true,
      backCaption: [L_Game.Cancel],
      confirmCaption: [L_Game.Delete],
      onConfirm: bind(ibind(this.discardStage), stage),
    })
  }

  private discardStage(stage: Stage) {
    const player = game.get_player(this.playerIndex)!
    recordPlayerLastPosition(player)
    stage.discardInProject()
    const newStage = stage.project.getStage(stage.stageNumber)
    if (newStage) {
      teleportToStage(player, newStage)
    } else {
      const lastStage = stage.project.getStage(stage.project.settings.stageCount())
      if (lastStage) teleportToStage(player, lastStage)
    }
  }

  private beginMerge() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage) return
    const stageToMerge = this.getStageToMerge(stage)
    if (!stageToMerge) return
    showDialog(player, {
      title: [L_GuiProjectSettings.MergeStage],
      message: [
        [
          L_GuiProjectSettings.MergeStageConfirmation,
          stage.getSettings().name.get(),
          stageToMerge.getSettings().name.get(),
        ],
      ],
      redConfirm: true,
      backCaption: [L_Game.Cancel],
      confirmCaption: [L_Game.Confirm],
      onConfirm: bind(ibind(this.mergeStage), stage),
    })
  }

  private getStageToMerge(stage: Stage) {
    return stage.project.getStage(getStageToMerge(stage.stageNumber))
  }

  private mergeStage(stage: Stage) {
    const toMerge = this.getStageToMerge(stage)
    if (!toMerge) return
    const player = game.get_player(this.playerIndex)!
    recordPlayerLastPosition(player)
    stage.deleteByMerging()
    teleportToStage(player, toMerge)
  }

  private syncMapGenSettings() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (stage) syncMapGenSettings(stage)
  }

  private openMapGenSettingsSelect() {
    const player = game.get_player(this.playerIndex)
    const stage = playerCurrentStage(this.playerIndex).get()
    if (player && stage) openMapGenSettingsSelect(player, stage)
  }

  private scanExistingTiles() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (stage) stage.project.updates.scanProjectForExistingTiles()
  }
}

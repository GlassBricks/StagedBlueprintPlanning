// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { PlayerIndex, TilePrototypeFilter } from "factorio:runtime"
import { ibind, property, RegisterClass } from "../../lib"
import { Component, Element, FactorioJsx, RenderContext } from "../../lib/factoriojsx"
import { VerticalPusher } from "../../lib/factoriojsx/components"
import { L_GuiProjectSettings } from "../../locale"
import { Project } from "../../project/Project"
import {
  resetSpacePlatformTiles,
  setCheckerboard,
  setTilesAndCheckerboardForStage,
  setTilesAndWaterForStage,
  setTilesForStage,
} from "../../tiles/set-tiles"
import { Prototypes } from "../../constants"
import { playerCurrentStage } from "../player-current-stage"
import { LandfillButtonWidth, StageSettingsButtonWidth } from "./shared-constants"

@RegisterClass("gui:EditorTab")
export class EditorTab extends Component<{ project: Project }> {
  project!: Project
  playerIndex!: PlayerIndex

  override render(props: { project: Project }, context: RenderContext): Element {
    this.project = props.project
    this.playerIndex = context.playerIndex

    const selectedTile = this.project.settings.landfillTile
    const valueRaw = selectedTile.get()
    const selectedTileValue = valueRaw && valueRaw in prototypes.tile ? valueRaw : nil
    const tileIsNotBlueprintable = selectedTileValue && !prototypes.tile[selectedTileValue]?.items_to_place_this
    const allowNonBlueprintable = property<boolean>(!!tileIsNotBlueprintable)

    return (
      <frame style="inside_shallow_frame" direction="vertical" styleMod={{ padding: [5, 10] }}>
        <label caption={[L_GuiProjectSettings.Rebuild]} style="caption_label" />
        <button
          styleMod={{ width: StageSettingsButtonWidth }}
          caption={[L_GuiProjectSettings.ResyncWithWorld]}
          tooltip={[L_GuiProjectSettings.ResyncWithWorldTooltip]}
          on_gui_click={ibind(this.resyncWithWorld)}
        />
        <empty-widget styleMod={{ height: 5 }} />
        <button
          styleMod={{ width: StageSettingsButtonWidth }}
          caption={[L_GuiProjectSettings.RebuildStage]}
          tooltip={[L_GuiProjectSettings.RebuildStageTooltip]}
          on_gui_click={ibind(this.rebuildStage)}
        />
        <button
          styleMod={{ width: StageSettingsButtonWidth }}
          caption={[L_GuiProjectSettings.RebuildAllStages]}
          on_gui_click={ibind(this.rebuildAllStages)}
        />
        <line />
        <label caption={[L_GuiProjectSettings.Entities]} style="caption_label" />
        <button
          styleMod={{ width: StageSettingsButtonWidth }}
          caption={[L_GuiProjectSettings.DisableAllEntities]}
          on_gui_click={ibind(this.disableAllEntities)}
        />
        <button
          styleMod={{ width: StageSettingsButtonWidth }}
          caption={[L_GuiProjectSettings.EnableAllEntities]}
          on_gui_click={ibind(this.enableAllEntities)}
        />
        <line />
        <label caption={[L_GuiProjectSettings.Tiles]} style="caption_label" />
        <flow styleMod={{ vertical_align: "center" }}>
          <flow
            direction="horizontal"
            styleMod={{
              vertical_align: "center",
              right_margin: 5,
            }}
          >
            <label
              caption={
                this.project.settings.isSpacePlatform()
                  ? [L_GuiProjectSettings.PlatformTile]
                  : [L_GuiProjectSettings.SelectedTile]
              }
            />
            <choose-elem-button
              elem_type="tile"
              elem_value={selectedTile}
              elem_filters={allowNonBlueprintable.select(nil, [
                { filter: "item-to-place" } satisfies TilePrototypeFilter,
              ])}
            />
          </flow>
          <checkbox state={allowNonBlueprintable} caption={[L_GuiProjectSettings.AllowNonBlueprintableTiles]} />
        </flow>
        {this.project.settings.isSpacePlatform() ? (
          <button
            caption={[L_GuiProjectSettings.ResetSpacePlatformFoundations]}
            tooltip={[L_GuiProjectSettings.ResetSpacePlatformFoundationsTooltip]}
            on_gui_click={ibind(this.resetSpacePlatformFoundations)}
          />
        ) : (
          <>
            <button
              styleMod={{ width: LandfillButtonWidth }}
              caption={[L_GuiProjectSettings.SetLabTiles]}
              on_gui_click={ibind(this.setLabTiles)}
            />
            <button
              styleMod={{ width: LandfillButtonWidth }}
              caption={[L_GuiProjectSettings.SetSelectedTile]}
              on_gui_click={ibind(this.setSelectedTile)}
            />
            <button
              styleMod={{ width: LandfillButtonWidth }}
              caption={[L_GuiProjectSettings.SetSelectedTileAndLab]}
              tooltip={[L_GuiProjectSettings.SetSelectedTileAndLabTooltip]}
              on_gui_click={ibind(this.setLandfillAndLabTiles)}
            />
            <button
              styleMod={{ width: LandfillButtonWidth }}
              caption={[L_GuiProjectSettings.SetSelectedTileAndWater]}
              tooltip={[L_GuiProjectSettings.SetSelectedTileAndWaterTooltip]}
              on_gui_click={ibind(this.setLandfillAndWater)}
            />
          </>
        )}
        <VerticalPusher />
        <button style="mini_button" tooltip="super secret setting" on_gui_click={ibind(this.sss)} />
      </frame>
    )
  }

  private rebuildStage() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!(stage && stage.valid)) return
    stage.project.worldUpdates.rebuildStage(stage.stageNumber)
  }

  private rebuildAllStages() {
    this.project.worldUpdates.rebuildAllStages()
  }

  private resyncWithWorld() {
    this.project.worldUpdates.resyncWithWorld()
  }

  private disableAllEntities() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || !stage.valid) return
    stage.project.worldUpdates.disableAllEntitiesInStage(stage.stageNumber)
  }

  private enableAllEntities() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || !stage.valid) return
    stage.project.worldUpdates.enableAllEntitiesInStage(stage.stageNumber)
  }

  private setLabTiles() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || !stage.valid) return
    setCheckerboard(stage.getSurface(), stage.getBlueprintBBox())
  }

  private setSelectedTile() {
    this.trySetLandfillTile(setTilesForStage)
  }

  private setLandfillAndWater() {
    this.trySetLandfillTile(setTilesAndWaterForStage)
  }

  private setLandfillAndLabTiles() {
    this.trySetLandfillTile(setTilesAndCheckerboardForStage)
  }

  private trySetLandfillTile(fn: typeof setTilesAndWaterForStage) {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || !stage.valid) return
    const success = fn(stage)
    if (!success) {
      game.get_player(this.playerIndex)?.create_local_flying_text({
        text: [L_GuiProjectSettings.FailedToSetTiles],
        create_at_cursor: true,
      })
    }
  }

  private resetSpacePlatformFoundations() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || !stage.valid) return
    const success = resetSpacePlatformTiles(stage)
    if (!success) {
      game.get_player(this.playerIndex)?.create_local_flying_text({
        text: [L_GuiProjectSettings.FailedToSetTiles],
        create_at_cursor: true,
      })
    }
  }

  private sssCount = 0

  private sss() {
    this.sssCount++
    if (this.sssCount >= 3) {
      const player = game.get_player(this.playerIndex)
      if (!player) return
      player.play_sound({ path: Prototypes.BANANA, override_sound_type: "alert" })
      this.sssCount = 0
    }
  }
}

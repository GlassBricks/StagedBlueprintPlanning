/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { Stage, UserAssembly } from "../assembly/AssemblyDef"
import { editBlueprintFilters } from "../assembly/edit-blueprint-settings"
import { AutoSetTilesType } from "../assembly/tiles"
import { exportBlueprintBookToFile } from "../assembly/UserAssembly"
import { WorldUpdater } from "../assembly/WorldUpdater"
import { getStageToMerge } from "../entity/AssemblyEntity"
import { funcRef, ibind, RegisterClass, registerFunctions } from "../lib"
import { Component, destroy, FactorioJsx, renderNamed, Spec, Tracker } from "../lib/factoriojsx"
import {
  CollapseButton,
  DraggableSpace,
  ExpandButton,
  Fn,
  HorizontalPusher,
  showDialog,
  TitleBar,
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
  teleportToStage,
  teleportToSurface1,
} from "./player-current-stage"
import { StageSelector } from "./StageSelector"

declare global {
  interface PlayerData {
    compactAssemblySettings?: true
  }
}
declare const global: GlobalWithPlayers

function SettingsStageSelector(assembly: UserAssembly) {
  return (
    <StageSelector
      uses="list-box"
      styleMod={{ height: stageListBoxHeight, width: stageListBoxWidth }}
      assembly={assembly}
    />
  )
}
@RegisterClass("gui:CompactAssemblySettings")
class CompactAssemblySettings extends Component<{ assembly: UserAssembly }> {
  assembly!: UserAssembly
  override render({ assembly }: { assembly: UserAssembly }): Spec {
    const captionedAssemblyName = assembly.displayName.map(funcRef(CompactAssemblySettings.captionedAssemblyName))

    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            caption={captionedAssemblyName}
            style="caption_label"
            styleMod={{ maximal_width: stageListBoxWidth - 50 }}
            ignored_by_interaction
          />
          <DraggableSpace />
          <ExpandButton on_gui_click={funcRef(expandSettings)} tooltip={[L_GuiAssemblySettings.ShowFullSettings]} />
        </TitleBar>
        {SettingsStageSelector(assembly)}
      </frame>
    )
  }
  private static captionedAssemblyName(this: void, displayName: LocalisedString): LocalisedString {
    return [L_GuiAssemblySettings.AssemblyCaption, displayName]
  }
}

const stageListBoxHeight = 28 * 12
const stageListBoxWidth = 140
const stageSettingsWidth = 160

const newStageHeight = 38
const insertButtonWidth = 100

const dropDownWidth = 180
const blueprintSettingsButtonWidth = 180

@RegisterClass("gui:AssemblySettings")
class AssemblySettings extends Component<{ assembly: UserAssembly }> {
  assembly!: UserAssembly
  playerIndex!: PlayerIndex

  public override render(props: { assembly: UserAssembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.playerIndex = tracker.playerIndex

    return (
      <frame direction="vertical">
        <TitleBar>
          <label caption={[L_GuiAssemblySettings.Title]} style="frame_title" />
          <DraggableSpace />
          <CollapseButton on_gui_click={funcRef(collapseSettings)} tooltip={[L_GuiAssemblySettings.HideFullSettings]} />
        </TitleBar>
        <frame style="inside_shallow_frame" direction="vertical">
          <frame style="subheader_frame" direction="horizontal">
            <ItemRename
              name={this.assembly.name}
              displayName={this.assembly.displayName}
              renameTooltip={[L_GuiAssemblySettings.RenameAssembly]}
            />
            <HorizontalPusher />
            <TrashButton tooltip={[L_GuiAssemblySettings.DeleteAssembly]} on_gui_click={ibind(this.beginDelete)} />
          </frame>
          <tabbed-pane style="tabbed_pane_with_no_side_padding" selected_tab_index={1}>
            <tab caption={[L_GuiAssemblySettings.Stages]} />
            {this.StageSettingsTab()}
            <tab caption={[L_GuiAssemblySettings.Editing]} />
            {this.EditingTab()}
            <tab caption={[L_GuiAssemblySettings.Blueprints]} />
            {this.BlueprintSettingsTab()}
          </tabbed-pane>
        </frame>
      </frame>
    )
  }

  private StageSettingsTab() {
    const currentStage = playerCurrentStage(this.playerIndex)
    return (
      <flow direction="vertical" styleMod={{ vertical_spacing: 0, top_margin: -5 }}>
        <flow
          direction="horizontal"
          styleMod={{
            vertical_align: "center",
            padding: [5, 10],
            height: newStageHeight,
          }}
        >
          <label style="caption_label" caption={[L_GuiAssemblySettings.NewStage]} />
          <HorizontalPusher />
          <button
            styleMod={{ width: insertButtonWidth }}
            caption={[L_GuiAssemblySettings.AfterCurrent]}
            on_gui_click={ibind(this.newStageAfter)}
          />
          <button
            styleMod={{ width: insertButtonWidth }}
            caption={[L_GuiAssemblySettings.AtFront]}
            on_gui_click={ibind(this.newStageAtFront)}
          />
        </flow>
        <flow direction="horizontal" styleMod={{ padding: 0 }}>
          {SettingsStageSelector(this.assembly)}
          <Fn
            uses="frame"
            from={currentStage}
            map={ibind(this.renderStageSettings)}
            direction="vertical"
            style="inside_shallow_frame"
            styleMod={{
              minimal_width: stageSettingsWidth,
              vertically_stretchable: true,
              horizontally_stretchable: true,
            }}
          />
        </flow>
      </flow>
    )
  }
  private renderStageSettings(stage: Stage | nil): Spec | nil {
    if (stage && stage.assembly == this.assembly) {
      return <StageSettings stage={stage} />
    }
    return nil
  }
  private EditingTab() {
    return (
      <flow direction="horizontal" styleMod={{ top_margin: -5, top_padding: newStageHeight }}>
        <StageSelector
          uses="list-box"
          styleMod={{ height: stageListBoxHeight, width: stageListBoxWidth }}
          assembly={this.assembly}
        />
        <frame
          direction="vertical"
          style="inside_shallow_frame_with_padding"
          styleMod={{ vertically_stretchable: true }}
        >
          <flow direction="vertical" styleMod={{ vertical_spacing: 5 }}>
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiAssemblySettings.ResetStage]}
              tooltip={[L_GuiAssemblySettings.ResetStageTooltip]}
              on_gui_click={ibind(this.resetStage)}
            />

            <line direction="horizontal" />
            <label style="caption_label" caption={[L_GuiAssemblySettings.SetTiles]} />
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiAssemblySettings.LabTiles]}
              on_gui_click={ibind(this.setLabTiles)}
            />
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiAssemblySettings.LandfillAndWater]}
              on_gui_click={ibind(this.setLandfillAndWater)}
            />
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiAssemblySettings.LandfillAndLab]}
              on_gui_click={ibind(this.setLandfillAndLabTiles)}
            />
            <line direction="horizontal" />

            <label style="caption_label" caption={[L_GuiAssemblySettings.Entities]} />
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiAssemblySettings.DisableAllEntities]}
              on_gui_click={ibind(this.disableAllEntities)}
            />
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiAssemblySettings.EnableAllEntities]}
              on_gui_click={ibind(this.enableAllEntities)}
            />
          </flow>
        </frame>
      </flow>
    )
  }
  private BlueprintSettingsTab() {
    const assemblyBlueprintSettings = this.assembly.assemblyBlueprintSettings
    return (
      <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
        <label
          style="caption_label"
          caption={[L_GuiAssemblySettings.BlueprintSettings]}
          tooltip={[L_GuiAssemblySettings.BlueprintSettingsTooltip]}
        />
        <flow direction="horizontal">
          <label caption={[L_GuiAssemblySettings.BlueprintNaming]} />
          <HorizontalPusher />
          <drop-down
            items={[
              [L_GuiAssemblySettings.BpNameEmpty],
              [L_GuiAssemblySettings.BpNameFromStage],
              [L_GuiAssemblySettings.BpNameCustom],
            ]}
            selected_index={assemblyBlueprintSettings.blueprintNameMode}
            styleMod={{ width: dropDownWidth }}
          />
        </flow>
        <checkbox
          state={assemblyBlueprintSettings.replaceInfinityWithCombinators}
          caption={[L_GuiAssemblySettings.ReplaceInfinityWithCombinators]}
          tooltip={[L_GuiAssemblySettings.ReplaceInfinityWithCombinatorsTooltip]}
        />
        <checkbox
          state={assemblyBlueprintSettings.autoLandfill}
          caption={[L_GuiAssemblySettings.AutoLandfill]}
          tooltip={[L_GuiAssemblySettings.AutoLandfillTooltip]}
        />
        <button
          caption={[L_GuiAssemblySettings.EditBlueprintFilters]}
          tooltip={[L_GuiAssemblySettings.EditBlueprintFiltersTooltip]}
          on_gui_click={ibind(this.editBlueprintFilters)}
          styleMod={{ width: blueprintSettingsButtonWidth }}
        />
        <button
          caption={[L_GuiAssemblySettings.SyncGridSettings]}
          tooltip={[L_GuiAssemblySettings.SyncGridSettingsDescription]}
          on_gui_click={ibind(this.syncGridSettings)}
          styleMod={{ width: blueprintSettingsButtonWidth }}
        />

        <line direction="horizontal" />

        <label style="caption_label" caption={[L_GuiAssemblySettings.BlueprintBookSettings]} />

        <flow direction="horizontal">
          <label caption={[L_GuiAssemblySettings.BlueprintBookNaming]} />
          <HorizontalPusher />
          <drop-down
            items={[[L_GuiAssemblySettings.BpNameEmpty], [L_GuiAssemblySettings.BpNameFromAssembly]]}
            selected_index={assemblyBlueprintSettings.bookNameMode}
            styleMod={{ width: dropDownWidth }}
          />
        </flow>
        <checkbox
          state={assemblyBlueprintSettings.useNextStageTiles}
          caption={[L_GuiAssemblySettings.UseNextStageTiles]}
          tooltip={[L_GuiAssemblySettings.UseNextStageTilesTooltip]}
        />
        <button
          caption={[L_GuiAssemblySettings.GetBlueprintBook]}
          on_gui_click={ibind(this.getBlueprintBook)}
          styleMod={{ width: blueprintSettingsButtonWidth }}
        />
        <button
          caption={[L_GuiAssemblySettings.ExportBlueprintBookStringToFile]}
          tooltip={[L_GuiAssemblySettings.ExportBlueprintBookStringToFileTooltip]}
          on_gui_click={ibind(this.exportBlueprintBookStringToFile)}
          styleMod={{ width: blueprintSettingsButtonWidth }}
        />
      </flow>
    )
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
      onConfirm: ibind(this.deleteAssembly),
    })
  }

  private deleteAssembly() {
    this.assembly.delete()
    teleportToSurface1(game.get_player(this.playerIndex)!)
  }

  private newStageAfter() {
    const currentStage = playerCurrentStage(this.playerIndex).get()
    if (!currentStage || currentStage.assembly != this.assembly) return
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

  private getBlueprintBook() {
    const player = game.get_player(this.playerIndex)
    if (!player || !player.clear_cursor()) return
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
  private exportBlueprintBookStringToFile() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const fileName = exportBlueprintBookToFile(player, this.assembly)
    if (fileName) {
      player.print([L_Interaction.BlueprintBookExported, fileName])
    } else {
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintBookEmpty],
        create_at_cursor: true,
      })
    }
  }
  private editBlueprintFilters() {
    editBlueprintFilters(game.get_player(this.playerIndex)!, this.assembly.assemblyBlueprintSettings)
  }
  private syncGridSettings() {
    this.assembly.syncGridSettings()
  }
  private resetStage() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || stage.assembly != this.assembly) return
    WorldUpdater.resetStage(stage.assembly, stage.stageNumber)
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
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || stage.assembly != this.assembly) return
    const success = stage.autoSetTiles(type)
    if (!success) {
      game.get_player(this.playerIndex)?.create_local_flying_text({
        text: [L_GuiAssemblySettings.FailedToSetTiles],
        create_at_cursor: true,
      })
    }
  }

  private disableAllEntities() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || stage.assembly != this.assembly) return
    WorldUpdater.disableAllEntities(stage.assembly, stage.stageNumber)
  }

  private enableAllEntities() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || stage.assembly != this.assembly) return
    WorldUpdater.enableAllEntities(stage.assembly, stage.stageNumber)
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
            caption={[L_GuiAssemblySettings.GetBlueprint]}
            tooltip={[L_GuiAssemblySettings.GetBlueprintTooltip]}
            on_gui_click={ibind(this.getBlueprint)}
          />
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.EditBlueprint]}
            tooltip={[L_GuiAssemblySettings.EditBlueprintTooltip]}
            on_gui_click={ibind(this.editBlueprint)}
          />
          <line direction="horizontal" />
          <VerticalPusher />
          <button
            style="red_button"
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiAssemblySettings.DeleteStage]}
            enabled={this.stage.assembly.maxStage() > 1}
            on_gui_click={ibind(this.beginDelete)}
          />
        </flow>
      </>
    )
  }

  private getBlueprint() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const cursorStack = player.cursor_stack
    if (!cursorStack || !player.clear_cursor()) return
    const took = this.stage.takeBlueprint(cursorStack)
    if (!took) {
      cursorStack.clear()
      return player.create_local_flying_text({
        text: [L_Interaction.BlueprintEmpty],
        create_at_cursor: true,
      })
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
      onConfirm: ibind(this.deleteStage),
    })
  }
  private getStageToMerge() {
    const stageNumber = this.stage.stageNumber
    const isFirst = stageNumber == 1
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

const AssemblySettingsName = `${script.mod_name}:assembly-settings`
const DefaultAssemblySettingsLoc = { x: 0, y: 350 }
function renderAtAssemblySettingsLoc(player: LuaPlayer, spec: Spec): void {
  const existing = player.gui.screen[AssemblySettingsName]
  const loc = existing?.location ?? DefaultAssemblySettingsLoc
  const element = renderNamed(spec, player.gui.screen, AssemblySettingsName)!
  element.location = loc
}

function renderPlaceholder(player: LuaPlayer) {
  renderAtAssemblySettingsLoc(
    player,
    <flow
      direction="vertical"
      styleMod={{
        minimal_width: assemblySettingsWidth,
        minimal_height: assemblySettingsHeight,
      }}
      visible={false}
    />,
  )
}

function renderCompactSettings(player: LuaPlayer, assembly: UserAssembly) {
  renderAtAssemblySettingsLoc(player, <CompactAssemblySettings assembly={assembly} />)
}

function renderFullSettings(player: LuaPlayer, assembly: UserAssembly) {
  renderAtAssemblySettingsLoc(player, <AssemblySettings assembly={assembly} />)
}

function renderGuiForAssembly(player: LuaPlayer, currentAssembly: UserAssembly | nil): void {
  if (!currentAssembly) {
    return renderPlaceholder(player)
  }
  const useCompactSettings = global.players[player.index].compactAssemblySettings
  if (useCompactSettings) {
    renderCompactSettings(player, currentAssembly)
  } else {
    renderFullSettings(player, currentAssembly)
  }
}

function updateGui(player: LuaPlayer) {
  const currentAssembly = playerCurrentStage(player.index).get()?.assembly
  renderGuiForAssembly(player, currentAssembly)
}

function expandSettings({ player_index }: OnGuiClickEvent) {
  global.players[player_index].compactAssemblySettings = nil
  updateGui(game.get_player(player_index)!)
}

function collapseSettings({ player_index }: OnGuiClickEvent) {
  global.players[player_index].compactAssemblySettings = true
  updateGui(game.get_player(player_index)!)
}

registerFunctions("gui:assembly-settings", {
  expandSettings,
  collapseSettings,
})

PlayerChangedStageEvent.addListener((player, newStage, oldStage) => {
  const newAssembly = newStage?.assembly
  const oldAssembly = oldStage?.assembly
  if (newAssembly != oldAssembly) {
    renderGuiForAssembly(player, newAssembly)
  }
})
export function refreshCurrentAssembly(): void {
  for (const [, player] of game.players) {
    const currentStage = playerCurrentStage(player.index).get()
    renderGuiForAssembly(player, currentStage?.assembly)
  }
}
Migrations.fromAny(refreshCurrentAssembly)

Migrations.to("0.15.0", () => {
  const AssemblySettingsFlowName = "gui:AssemblySettingsFrame"
  for (const [, player] of game.players) {
    destroy(player.gui.screen[AssemblySettingsFlowName])
    interface OldPlayerData {
      currentShownAssembly?: UserAssembly
    }
    const playerData = global.players[player.index] as OldPlayerData | nil
    delete playerData?.currentShownAssembly
  }
})

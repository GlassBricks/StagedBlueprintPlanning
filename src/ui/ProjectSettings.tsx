/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { LocalisedString, LuaPlayer, OnGuiClickEvent, PlayerIndex, TilePrototypeFilter } from "factorio:runtime"
import {
  exportBlueprintBookToFile,
  submitProjectBlueprintBookTask,
  takeStageBlueprint,
} from "../blueprints/blueprint-creation"
import { ProjectOrStageBlueprintSettings } from "../blueprints/blueprint-settings"
import { editBlueprintFilters, editInItemBlueprintSettings } from "../blueprints/edit-blueprint-settings"
import { Colors, Prototypes } from "../constants"
import { getStageToMerge } from "../entity/ProjectEntity"
import {
  bind,
  funcRef,
  ibind,
  multiMap,
  onPlayerInitSince,
  Property,
  property,
  RegisterClass,
  registerFunctions,
} from "../lib"
import { Component, destroy, Element, ElemProps, FactorioJsx, RenderContext, renderNamed } from "../lib/factoriojsx"
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
import { L_GuiProjectSettings, L_Interaction } from "../locale"
import { syncMapGenSettings } from "../project/map-gen"
import { Stage, UserProject } from "../project/ProjectDef"
import {
  setCheckerboard,
  setTilesAndCheckerboardForStage,
  setTilesAndWaterForStage,
  setTilesForStage,
} from "../project/set-tiles"
import { highlightIfNotNil, highlightIfOverriden } from "../utils/DiffedProperty"
import { MaybeRevertButton } from "../utils/RevertButton"
import { CheckboxTextfield } from "./components/CheckboxTextfield"
import { ItemRename } from "./ItemRename"
import {
  exitProject,
  PlayerChangedStageEvent,
  playerCurrentStage,
  recordPlayerLastPosition,
  teleportToStage,
} from "./player-current-stage"
import { StageSelector } from "./StageSelector"

declare global {
  interface PlayerData {
    compactProjectSettings?: true
    projectSettingsSelectedTab: Property<number>
  }
}
declare const global: GlobalWithPlayers

onPlayerInitSince("0.23.0", (playerIndex) => {
  const data = global.players[playerIndex]
  data.projectSettingsSelectedTab = property(1)
})

const StageListBoxHeight = 28 * 12
const StageListBoxWidth = 140

const NewStageBarHeight = 100

const StageSettingsButtonWidth = 180
const OtherSettingsButtonWidth = 180
const BpSettingsButtonWidth = 220

const ProjectSettingsTabWidth = 420

function EditButton(props: ElemProps<"button">) {
  return (
    <button
      caption={[L_GuiProjectSettings.Edit]}
      {...props}
      styleMod={{
        width: 48,
      }}
    />
  )
}

function StageListBox(project: UserProject) {
  return (
    <StageSelector
      uses="list-box"
      styleMod={{ height: StageListBoxHeight, width: StageListBoxWidth }}
      project={project}
    />
  )
}
@RegisterClass("gui:CompactProjectSettings")
class CompactProjectSettings extends Component<{
  project: UserProject
}> {
  project!: UserProject
  override render({ project }: { project: UserProject }): Element {
    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            caption={project.displayName()}
            style="caption_label"
            styleMod={{ maximal_width: StageListBoxWidth - 50 }}
            ignored_by_interaction
          />
          <DraggableSpace />
          <ExpandButton on_gui_click={funcRef(expandSettings)} tooltip={[L_GuiProjectSettings.ShowFullSettings]} />
        </TitleBar>
        {StageListBox(project)}
      </frame>
    )
  }
}

@RegisterClass("gui:ProjectSettings")
class ProjectSettings extends Component<{
  project: UserProject
}> {
  project!: UserProject
  playerIndex!: PlayerIndex

  override render(
    props: {
      project: UserProject
    },
    context: RenderContext,
  ): Element {
    this.project = props.project
    this.playerIndex = context.playerIndex

    const selectedTabIndex = global.players[this.playerIndex].projectSettingsSelectedTab

    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            caption={[L_GuiProjectSettings.TitleCaption]}
            style="frame_title"
            styleMod={{ right_margin: 5 }}
            ignored_by_interaction
          />
          <ItemRename
            name={this.project.name}
            displayName={this.project.displayName()}
            renameTooltip={[L_GuiProjectSettings.RenameProject]}
            maximalWidth={240}
          />
          <DraggableSpace />
          <CollapseButton on_gui_click={funcRef(collapseSettings)} tooltip={[L_GuiProjectSettings.HideFullSettings]} />
        </TitleBar>
        <flow direction="horizontal" styleMod={{ horizontal_spacing: 12 }}>
          <flow direction="vertical" styleMod={{ vertical_spacing: 0 }}>
            {StageListBox(this.project)}
            {this.NewStageBox()}
          </flow>
          <frame style="inside_shallow_frame" direction="vertical" styleMod={{ top_padding: 5 }}>
            <tabbed-pane
              style="tabbed_pane_with_no_side_padding"
              styleMod={{
                vertically_stretchable: true,
                minimal_width: ProjectSettingsTabWidth,
              }}
              selected_tab_index={selectedTabIndex}
            >
              <tab caption={[L_GuiProjectSettings.Stage]} />
              {this.StagesTab()}
              <tab caption={[L_GuiProjectSettings.Blueprints]} />
              {this.BlueprintSettingsTab()}
              <tab caption={[L_GuiProjectSettings.Other]} />
              {this.OtherTab()}
            </tabbed-pane>
          </frame>
        </flow>
      </frame>
    )
  }

  private StagesTab() {
    const currentStage = playerCurrentStage(this.playerIndex)
    return (
      <Fn
        uses="frame"
        from={currentStage}
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
  private NewStageBox() {
    return (
      <frame
        direction="vertical"
        style="bordered_frame"
        styleMod={{
          height: NewStageBarHeight,
          horizontally_stretchable: true,
          margin: -2,
          padding: 5,
        }}
      >
        <label style="caption_label" caption={[L_GuiProjectSettings.NewStage]} />
        <button
          styleMod={{ horizontally_stretchable: true }}
          caption={[L_GuiProjectSettings.AfterCurrent]}
          on_gui_click={ibind(this.newStageAfter)}
        />
        <button
          styleMod={{ horizontally_stretchable: true }}
          caption={[L_GuiProjectSettings.AtFront]}
          on_gui_click={ibind(this.newStageAtFront)}
        />
      </frame>
    )
  }
  private renderStageSettings(stage: Stage | nil): Element | nil {
    if (stage && stage.project == this.project) {
      return <StageSettings stage={stage} />
    }
    return nil
  }

  private BlueprintSettingsTab() {
    return (
      <flow
        direction="vertical"
        styleMod={{
          vertical_spacing: 0,
        }}
      >
        <tabbed-pane
          style="tabbed_pane_with_no_side_padding"
          selected_tab_index={1}
          styleMod={{
            horizontally_stretchable: true,
            bottom_margin: -10,
          }}
        >
          <tab caption={[L_GuiProjectSettings.BlueprintSettingsDefaults]} />
          {this.BpSettings(nil)}
          <tab
            caption={[L_GuiProjectSettings.BlueprintSettingsCurrentStage]}
            tooltip={[L_GuiProjectSettings.BlueprintSettingsCurrentStageTooltip]}
          />
          <Fn uses="flow" from={playerCurrentStage(this.playerIndex)} map={ibind(this.BpSettings)} />
          <tab caption={[L_GuiProjectSettings.BpExport]} />
          {this.BpExportTab()}
        </tabbed-pane>
      </flow>
    )
  }

  private BpSettings(stage: Stage | nil): Element {
    const settings: ProjectOrStageBlueprintSettings =
      stage == nil ? this.project.defaultBlueprintSettings : stage.getBlueprintSettingsView()

    return (
      <flow direction="vertical" styleMod={{ padding: 10, bottom_padding: 20 }}>
        <label
          caption={
            stage == nil
              ? [L_GuiProjectSettings.EditingDefaults]
              : stage.name.map(funcRef(ProjectSettings.editingForStage))
          }
          styleMod={{
            font: "heading-2",
            font_color: stage == nil ? [1, 1, 1] : Colors.OverrideHighlight,
          }}
        />
        <line />

        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label
            caption={stage == nil ? [L_GuiProjectSettings.GridSettings] : [L_GuiProjectSettings.GridSettingsAndIcons]}
            styleMod={stage && highlightIfNotNil(this.anyGridSettingsChanged(stage))}
          />
          <EditButton on_gui_click={bind(ibind(this.editGridSettings), settings, stage)} />
        </flow>

        <label caption={[L_GuiProjectSettings.EntityFilters]} style="caption_label" />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label caption={[L_GuiProjectSettings.Blacklist]} styleMod={highlightIfOverriden(settings.blacklist)} />
          <EditButton on_gui_click={bind(ibind(this.editFilter), settings, "blacklist")} />
          {MaybeRevertButton(settings.blacklist)}
        </flow>
        <flow direction="vertical" styleMod={{ vertical_spacing: 0 }}>
          <CheckboxTextfield
            captionBefore={[L_GuiProjectSettings.IncludeEntitiesInTheNextNStages1]}
            captionAfter={[L_GuiProjectSettings.IncludeEntitiesInTheNextNStages2]}
            tooltip={[L_GuiProjectSettings.IncludeEntitiesInTheNextNStagesTooltip]}
            value={settings.stageLimit}
          />
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <label
              caption={[L_GuiProjectSettings.OrInWhitelist]}
              styleMod={{
                left_margin: 28,
                ...highlightIfOverriden(settings.additionalWhitelist),
              }}
              enabled={settings.stageLimit.truthy()}
            />
            <EditButton
              on_gui_click={bind(ibind(this.editFilter), settings, "additionalWhitelist")}
              enabled={settings.stageLimit.truthy()}
            />
            {MaybeRevertButton(settings.additionalWhitelist)}
          </flow>
        </flow>

        <label caption={[L_GuiProjectSettings.EntityEdits]} style="caption_label" />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox
            state={settings.useModulePreloading}
            caption={[L_GuiProjectSettings.UseModulePreloading]}
            tooltip={[L_GuiProjectSettings.UseModulePreloadingTooltip]}
            styleMod={highlightIfOverriden(settings.useModulePreloading)}
          />
          {MaybeRevertButton(settings.useModulePreloading)}
        </flow>

        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox
            state={settings.replaceInfinityEntitiesWithCombinators}
            caption={[L_GuiProjectSettings.ReplaceInfinityWithCombinators]}
            tooltip={[L_GuiProjectSettings.ReplaceInfinityWithCombinatorsTooltip]}
            styleMod={highlightIfOverriden(settings.replaceInfinityEntitiesWithCombinators)}
          />
          {MaybeRevertButton(settings.replaceInfinityEntitiesWithCombinators)}
        </flow>
        <label caption={[L_GuiProjectSettings.Tiles]} style="caption_label" />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox
            state={settings.autoLandfill}
            caption={[L_GuiProjectSettings.AutoLandfill]}
            tooltip={[L_GuiProjectSettings.AutoLandfillTooltip]}
            styleMod={highlightIfOverriden(settings.autoLandfill)}
          />
          {MaybeRevertButton(settings.autoLandfill)}
        </flow>
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox
            state={settings.useNextStageTiles}
            caption={[L_GuiProjectSettings.UseNextStageTiles]}
            tooltip={[L_GuiProjectSettings.UseNextStageTilesTooltip]}
            styleMod={highlightIfOverriden(settings.useNextStageTiles)}
          />
          {MaybeRevertButton(settings.useNextStageTiles)}
        </flow>
      </flow>
    )
  }

  private static editingForStage(this: void, name: string): LocalisedString {
    return [L_GuiProjectSettings.EditingForStage, name]
  }

  private editGridSettings(settings: ProjectOrStageBlueprintSettings, stage: Stage | nil) {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const stageToUse = stage ?? this.project.getStage(this.project.numStages())!
    const name = stage ? stage.name.get() : "Defaults (only grid settings saved)"
    const successful = editInItemBlueprintSettings(
      player,
      settings,
      stageToUse.surface,
      stageToUse.getBlueprintBBox(),
      name,
    )

    if (!successful) {
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintEmpty],
        create_at_cursor: true,
      })
    }
  }

  private editFilter(settings: ProjectOrStageBlueprintSettings, type: "additionalWhitelist" | "blacklist") {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    editBlueprintFilters(player, settings, type)
  }

  private anyGridSettingsChanged(stage: Stage): Property<unknown> {
    const stageSettings = stage.stageBlueprintSettings
    return multiMap(
      funcRef(ProjectSettings.anyNotNil),
      stageSettings.snapToGrid,
      stageSettings.positionOffset,
      stageSettings.absoluteSnapping,
      stageSettings.positionRelativeToGrid,
    )
  }
  private static anyNotNil(this: void, a: unknown, b: unknown, c: unknown, d: unknown) {
    return a || b || c || d
  }

  private BpExportTab(): Element {
    return (
      <flow direction="vertical" styleMod={{ padding: 10 }}>
        <button
          caption={[L_GuiProjectSettings.GetBlueprintForCurrentStage]}
          styleMod={{ width: BpSettingsButtonWidth }}
          on_gui_click={ibind(this.getBlueprint)}
        />
        <line />
        <button
          caption={[L_GuiProjectSettings.MakeBlueprintBook]}
          tooltip={[L_GuiProjectSettings.MakeBlueprintBookTooltip]}
          styleMod={{ width: BpSettingsButtonWidth }}
          on_gui_click={ibind(this.makeBlueprintBook)}
        />
        <button
          caption={[L_GuiProjectSettings.ExportBlueprintBookStringToFile]}
          tooltip={[L_GuiProjectSettings.ExportBlueprintBookStringToFileTooltip]}
          styleMod={{ width: BpSettingsButtonWidth }}
          on_gui_click={ibind(this.exportBlueprintBookStringToFile)}
        />
      </flow>
    )
  }

  private getBlueprint() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || stage.project != this.project) return
    const player = game.get_player(this.playerIndex)
    if (!player || !player.clear_cursor()) return
    const stack = player.cursor_stack
    if (!stack) return
    const successful = takeStageBlueprint(stage, stack)
    if (!successful) {
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintEmpty],
        create_at_cursor: true,
      })
      return
    }
  }

  private makeBlueprintBook() {
    const player = game.get_player(this.playerIndex)
    if (!player || !player.clear_cursor()) return
    const stack = player.cursor_stack
    if (!stack) return
    submitProjectBlueprintBookTask(this.project, stack)
  }

  private exportBlueprintBookStringToFile() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const fileName = exportBlueprintBookToFile(this.project, player)
    if (fileName == nil) {
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintBookEmpty],
        create_at_cursor: true,
      })
    } else {
      player.print([L_Interaction.BlueprintBookExported, fileName])
    }
  }

  private OtherTab() {
    return (
      <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
        <button
          caption={[L_GuiProjectSettings.RebuildAllStages]}
          styleMod={{ width: OtherSettingsButtonWidth }}
          on_gui_click={ibind(this.rebuildAllStages)}
        />
        <button
          caption={[L_GuiProjectSettings.SyncMapGenSettings]}
          tooltip={[L_GuiProjectSettings.SyncMapGenSettingsTooltip]}
          styleMod={{ width: OtherSettingsButtonWidth }}
          on_gui_click={ibind(this.syncMapGenSettings)}
        />
        <line />
        <button
          style="red_button"
          caption={[L_GuiProjectSettings.DeleteProject]}
          styleMod={{ width: OtherSettingsButtonWidth }}
          on_gui_click={ibind(this.beginDelete)}
        />
        <VerticalPusher />
        <button style="mini_button" tooltip="super secret setting" on_gui_click={ibind(this.sss)} />
      </flow>
    )
  }
  private rebuildAllStages() {
    this.project.entityUpdates.rebuildAllStages()
  }
  private syncMapGenSettings() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (stage) syncMapGenSettings(stage)
  }
  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    showDialog(player, {
      title: [L_GuiProjectSettings.DeleteProject],
      message: [
        [L_GuiProjectSettings.DeleteProjectConfirmation1, this.project.displayName().get()],
        [L_GuiProjectSettings.DeleteProjectConfirmation2],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: ibind(this.deleteProject),
    })
  }

  private deleteProject() {
    this.project.delete()
    exitProject(game.get_player(this.playerIndex)!)
  }

  private newStageAfter() {
    const currentStage = playerCurrentStage(this.playerIndex).get()
    if (!currentStage || currentStage.project != this.project) return
    this.insertStage(currentStage.stageNumber + 1)
  }

  private newStageAtFront() {
    this.insertStage(1)
  }

  private insertStage(index: number) {
    if (!this.project.valid) return
    const stage = this.project.insertStage(index)
    teleportToStage(game.get_player(this.playerIndex)!, stage)
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

@RegisterClass("gui:StageSettings")
export class StageSettings extends Component<{
  stage: Stage
}> {
  playerIndex!: PlayerIndex
  stage!: Stage
  override render(
    props: {
      stage: Stage
    },
    context: RenderContext,
  ): Element {
    this.stage = props.stage
    this.playerIndex = context.playerIndex

    const selectedTile = this.stage.project.landfillTile
    const selectedTileValue = selectedTile.get()
    const tileIsNotBlueprintable = selectedTileValue && !game.tile_prototypes[selectedTileValue]?.items_to_place_this

    const allowNonBlueprintable = property<boolean>(!!tileIsNotBlueprintable)

    return (
      <>
        <frame style="subheader_frame" direction="horizontal">
          <ItemRename
            name={props.stage.name}
            displayName={props.stage.name}
            renameTooltip={[L_GuiProjectSettings.RenameStage]}
            maximalWidth={ProjectSettingsTabWidth}
          />
          <HorizontalPusher />
          <TrashButton
            tooltip={[L_GuiProjectSettings.DeleteStage]}
            enabled={this.stage.project.numStages() > 1}
            on_gui_click={ibind(this.beginDelete)}
          />
        </frame>
        <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
          <label style="caption_label" caption={[L_GuiProjectSettings.Entities]} />
          <button
            styleMod={{ width: StageSettingsButtonWidth }}
            caption={[L_GuiProjectSettings.ResetStage]}
            tooltip={[L_GuiProjectSettings.ResetStageTooltip]}
            on_gui_click={ibind(this.resetStage)}
          />
          <flow>
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
          </flow>

          <line />

          <label style="caption_label" caption={[L_GuiProjectSettings.SetTiles]} />
          <flow styleMod={{ vertical_align: "center" }}>
            <flow
              direction="horizontal"
              styleMod={{
                width: StageSettingsButtonWidth,
                vertical_align: "center",
              }}
            >
              <label caption={[L_GuiProjectSettings.SelectedTile]} />
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
          <flow>
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiProjectSettings.SetLabTiles]}
              on_gui_click={ibind(this.setLabTiles)}
            />
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiProjectSettings.SetSelectedTile]}
              on_gui_click={ibind(this.setSelectedTile)}
            />
          </flow>
          <flow>
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiProjectSettings.SetSelectedTileAndLab]}
              tooltip={[L_GuiProjectSettings.SetSelectedTileAndLabTooltip]}
              on_gui_click={ibind(this.setLandfillAndLabTiles)}
            />
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiProjectSettings.SetSelectedTileAndWater]}
              tooltip={[L_GuiProjectSettings.SetSelectedTileAndWaterTooltip]}
              on_gui_click={ibind(this.setLandfillAndWater)}
            />
          </flow>
        </flow>
      </>
    )
  }

  private resetStage() {
    const stage = this.stage
    if (stage.valid) stage.project.entityUpdates.rebuildStage(stage.stageNumber)
  }

  private setLabTiles() {
    setCheckerboard(this.stage.surface, this.stage.getBlueprintBBox())
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
    const stage = this.stage
    if (!stage.valid) return
    const success = fn(stage)
    if (!success) {
      game.get_player(this.playerIndex)?.create_local_flying_text({
        text: [L_GuiProjectSettings.FailedToSetTiles],
        create_at_cursor: true,
      })
    }
  }

  private disableAllEntities() {
    const stage = this.stage
    if (!stage.valid) return
    stage.project.entityUpdates.disableAllEntitiesInStage(stage.stageNumber)
  }

  private enableAllEntities() {
    const stage = this.stage
    if (!stage.valid) return
    stage.project.entityUpdates.enableAllEntitiesInStage(stage.stageNumber)
  }

  private beginDelete() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const { isFirst, toMerge } = this.getStageToMerge()
    if (!toMerge) return
    showDialog(player, {
      title: [L_GuiProjectSettings.DeleteStage],
      message: [
        [L_GuiProjectSettings.DeleteStageConfirmation1, this.stage.name.get()],
        [
          isFirst
            ? L_GuiProjectSettings.DeleteStageConfirmation2First
            : L_GuiProjectSettings.DeleteStageConfirmation2Middle,
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
    const toMerge = this.stage.project.getStage(getStageToMerge(stageNumber))
    return { isFirst, toMerge }
  }
  private deleteStage() {
    const { toMerge } = this.getStageToMerge()
    if (!toMerge) return
    const player = game.get_player(this.playerIndex)!
    recordPlayerLastPosition(player)
    this.stage.deleteInProject()
    teleportToStage(player, toMerge)
  }
}

const ProjectSettingsHeight = StageListBoxHeight + 120
const ProjectSettingsWidth = StageListBoxWidth + ProjectSettingsTabWidth + 30

const ProjectSettingsName = `${script.mod_name}:project-settings`
const DefaultProjectSettingsLoc = { x: 0, y: 350 }
function renderAtProjectSettingsLoc(player: LuaPlayer, spec: Element): void {
  const existing = player.gui.screen[ProjectSettingsName]
  const loc = existing?.location ?? DefaultProjectSettingsLoc
  const element = renderNamed(spec, player.gui.screen, ProjectSettingsName)!
  element.location = loc

  element.bring_to_front()
}
function renderPlaceholder(player: LuaPlayer) {
  renderAtProjectSettingsLoc(
    player,
    <flow
      direction="vertical"
      styleMod={{
        width: ProjectSettingsWidth,
        height: ProjectSettingsHeight,
      }}
      visible={false}
    />,
  )
}

function renderCompactSettings(player: LuaPlayer, project: UserProject) {
  renderAtProjectSettingsLoc(player, <CompactProjectSettings project={project} />)
}

function renderFullSettings(player: LuaPlayer, project: UserProject) {
  renderAtProjectSettingsLoc(player, <ProjectSettings project={project} />)
}

function renderGuiForProject(player: LuaPlayer, currentProject: UserProject | nil): void {
  if (!currentProject) {
    return renderPlaceholder(player)
  }

  if (global.players[player.index].compactProjectSettings) {
    renderCompactSettings(player, currentProject)
  } else {
    renderFullSettings(player, currentProject)
  }
}

function updateGui(player: LuaPlayer) {
  const currentProject = playerCurrentStage(player.index).get()?.project
  renderGuiForProject(player, currentProject)
}

function expandSettings({ player_index }: OnGuiClickEvent) {
  global.players[player_index].compactProjectSettings = nil
  updateGui(game.get_player(player_index)!)
}

function collapseSettings({ player_index }: OnGuiClickEvent) {
  global.players[player_index].compactProjectSettings = true
  updateGui(game.get_player(player_index)!)
}

registerFunctions("gui:project-settings", {
  expandSettings,
  collapseSettings,
})

PlayerChangedStageEvent.addListener((player, newStage, oldStage) => {
  const newProject = newStage?.project
  const oldProject = oldStage?.project
  if (newProject != oldProject) {
    renderGuiForProject(player, newProject)
  } else {
    bringSettingsWindowToFront(player)
  }
})

export function bringSettingsWindowToFront(player: LuaPlayer): void {
  const element = player.gui.screen[ProjectSettingsName]
  if (element) element.bring_to_front()
}
export function refreshCurrentProject(): void {
  for (const [, player] of game.players) {
    const currentStage = playerCurrentStage(player.index).get()
    renderGuiForProject(player, currentStage?.project)
  }
}
Migrations.to("0.15.1", () => {
  for (const [, player] of game.players) {
    destroy(player.gui.screen["gui:AssemblySettingsFrame"])
    interface OldPlayerData {
      currentShownAssembly?: UserProject
    }
    const playerData = global.players[player.index] as OldPlayerData | nil
    delete playerData?.currentShownAssembly
  }
})
Migrations.fromAny(refreshCurrentProject)
Migrations.early("0.23.0", () => {
  const oldProjectSettingsName = `${script.mod_name}:assembly-settings`
  for (const [, player] of game.players) {
    destroy(player.gui.screen[oldProjectSettingsName])
  }
})

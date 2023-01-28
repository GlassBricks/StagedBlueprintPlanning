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

import { Stage, UserAssembly } from "../assembly/AssemblyDef"
import { AutoSetTilesType } from "../assembly/tiles"
import { disableAllEntitiesInStage, enableAllEntitiesInStage, resetStage } from "../assembly/WorldUpdater"
import { exportBlueprintBookToFile, makeBlueprintBook, takeStageBlueprint } from "../blueprints/blueprint-creation"
import { AssemblyOrStageBlueprintSettings } from "../blueprints/blueprint-settings"
import { editBlueprintFilters, editInItemBlueprintSettings } from "../blueprints/edit-blueprint-settings"
import { Colors, Prototypes } from "../constants"
import { getStageToMerge } from "../entity/AssemblyEntity"
import { bind, funcRef, ibind, multiMap, Property, property, RegisterClass, registerFunctions } from "../lib"
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
import { L_GuiAssemblySettings, L_Interaction } from "../locale"
import { highlightIfNotNil, highlightIfOverriden } from "../utils/DiffedProperty"
import { CheckboxTextfield } from "./components/CheckboxTextfield"
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

const StageListBoxHeight = 28 * 12
const StageListBoxWidth = 140

const NewStageBarHeight = 100

const StageSettingsButtonWidth = 140

const BpSettingsButtonWidth = 180

const AssemblySettingsTabWidth = 420

function EditButton(props: ElemProps<"button">) {
  return (
    <button
      caption={[L_GuiAssemblySettings.Edit]}
      {...props}
      styleMod={{
        width: 48,
      }}
    />
  )
}

function StageListBox(assembly: UserAssembly) {
  return (
    <StageSelector
      uses="list-box"
      styleMod={{ height: StageListBoxHeight, width: StageListBoxWidth }}
      assembly={assembly}
    />
  )
}
@RegisterClass("gui:CompactAssemblySettings")
class CompactAssemblySettings extends Component<{ assembly: UserAssembly }> {
  assembly!: UserAssembly
  override render({ assembly }: { assembly: UserAssembly }): Element {
    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            caption={assembly.displayName}
            style="caption_label"
            styleMod={{ maximal_width: StageListBoxWidth - 50 }}
            ignored_by_interaction
          />
          <DraggableSpace />
          <ExpandButton on_gui_click={funcRef(expandSettings)} tooltip={[L_GuiAssemblySettings.ShowFullSettings]} />
        </TitleBar>
        {StageListBox(assembly)}
      </frame>
    )
  }
}

@RegisterClass("gui:AssemblySettings")
class AssemblySettings extends Component<{ assembly: UserAssembly }> {
  assembly!: UserAssembly
  playerIndex!: PlayerIndex

  public override render(props: { assembly: UserAssembly }, context: RenderContext): Element {
    this.assembly = props.assembly
    this.playerIndex = context.playerIndex

    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            caption={[L_GuiAssemblySettings.TitleCaption]}
            style="frame_title"
            styleMod={{ right_margin: 5 }}
            ignored_by_interaction
          />
          <ItemRename
            name={this.assembly.name}
            displayName={this.assembly.displayName}
            renameTooltip={[L_GuiAssemblySettings.RenameAssembly]}
            maximalWidth={240}
          />
          <DraggableSpace />
          <CollapseButton on_gui_click={funcRef(collapseSettings)} tooltip={[L_GuiAssemblySettings.HideFullSettings]} />
        </TitleBar>
        <flow direction="horizontal" styleMod={{ horizontal_spacing: 12 }}>
          <flow direction="vertical" styleMod={{ vertical_spacing: 0 }}>
            {StageListBox(this.assembly)}
            {this.NewStageBox()}
          </flow>
          <frame style="inside_shallow_frame" direction="vertical" styleMod={{ top_padding: 5 }}>
            <tabbed-pane
              style="tabbed_pane_with_no_side_padding"
              selected_tab_index={1}
              styleMod={{
                vertically_stretchable: true,
                minimal_width: AssemblySettingsTabWidth,
              }}
              onCreate={(e) => (e.selected_tab_index = 2)}
            >
              <tab caption={[L_GuiAssemblySettings.Stage]} />
              {this.StagesTab()}
              <tab caption={[L_GuiAssemblySettings.Blueprints]} />
              {this.BlueprintSettingsTab()}
              <tab caption={[L_GuiAssemblySettings.Other]} />
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
        <label style="caption_label" caption={[L_GuiAssemblySettings.NewStage]} />
        <button
          styleMod={{ horizontally_stretchable: true }}
          caption={[L_GuiAssemblySettings.AfterCurrent]}
          on_gui_click={ibind(this.newStageAfter)}
        />
        <button
          styleMod={{ horizontally_stretchable: true }}
          caption={[L_GuiAssemblySettings.AtFront]}
          on_gui_click={ibind(this.newStageAtFront)}
        />
      </frame>
    )
  }
  private renderStageSettings(stage: Stage | nil): Element | nil {
    if (stage && stage.assembly == this.assembly) {
      return <StageSettings stage={stage} />
    }
    return nil
  }

  private BlueprintSettingsTab() {
    const selectedIndex = property(1)
    return (
      <flow
        direction="vertical"
        styleMod={{
          vertical_spacing: 0,
        }}
      >
        <tabbed-pane
          style="tabbed_pane_with_no_side_padding"
          selected_tab_index={selectedIndex}
          styleMod={{
            horizontally_stretchable: true,
            bottom_margin: -10,
          }}
        >
          <tab caption={[L_GuiAssemblySettings.Defaults]} />
          {this.BpSettings(nil)}
          <tab caption={[L_GuiAssemblySettings.CurrentStage]} tooltip={[L_GuiAssemblySettings.CurrentStageTooltip]} />
          <Fn uses="flow" from={playerCurrentStage(this.playerIndex)} map={ibind(this.BpSettings)} />
          <tab caption={[L_GuiAssemblySettings.BpExport]} />
          {this.BpExportTab()}
        </tabbed-pane>
      </flow>
    )
  }

  private BpSettings(stage: Stage | nil): Element {
    const settings: AssemblyOrStageBlueprintSettings =
      stage == nil ? this.assembly.defaultBlueprintSettings : stage.getBlueprintSettingsView()

    return (
      <flow direction="vertical" styleMod={{ padding: 10 }}>
        <label
          caption={
            stage == nil
              ? [L_GuiAssemblySettings.EditingDefaults]
              : stage.name.map(funcRef(AssemblySettings.editingForStage))
          }
          styleMod={{
            font: "heading-2",
            font_color: stage == nil ? [1, 1, 1] : Colors.OverrideHighlight,
          }}
        />
        <line />

        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label
            caption={stage == nil ? [L_GuiAssemblySettings.GridSettings] : [L_GuiAssemblySettings.GridSettingsAndIcons]}
            styleMod={stage && highlightIfNotNil(this.anyGridSettingsChanged(stage))}
          />
          <EditButton on_gui_click={bind(ibind(this.editGridSettings), settings, stage)} />
        </flow>

        <label caption={[L_GuiAssemblySettings.FilteringEntities]} style="caption_label" />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label caption={[L_GuiAssemblySettings.Blacklist]} styleMod={highlightIfOverriden(settings.blacklist)} />
          <EditButton on_gui_click={bind(ibind(this.editFilter), settings, "blacklist")} />
        </flow>
        <flow direction="vertical" styleMod={{ vertical_spacing: 0 }}>
          <CheckboxTextfield
            captionBefore={[L_GuiAssemblySettings.IncludeEntitiesInTheNextNStages1]}
            captionAfter={[L_GuiAssemblySettings.IncludeEntitiesInTheNextNStages2]}
            tooltip={[L_GuiAssemblySettings.IncludeEntitiesInTheNextNStagesTooltip]}
            value={settings.stageLimit}
          />
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <label
              caption={[L_GuiAssemblySettings.OrInWhitelist]}
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
          </flow>
        </flow>

        <label caption={[L_GuiAssemblySettings.Tiles]} style="caption_label" />
        <checkbox
          state={settings.autoLandfill}
          caption={[L_GuiAssemblySettings.AutoLandfill]}
          tooltip={[L_GuiAssemblySettings.AutoLandfillTooltip]}
          styleMod={highlightIfOverriden(settings.autoLandfill)}
        />
        <checkbox
          state={settings.useNextStageTiles}
          caption={[L_GuiAssemblySettings.UseNextStageTiles]}
          tooltip={[L_GuiAssemblySettings.UseNextStageTilesTooltip]}
          styleMod={highlightIfOverriden(settings.useNextStageTiles)}
        />

        <label caption={[L_GuiAssemblySettings.Other]} style="caption_label" />

        <checkbox
          state={settings.replaceInfinityEntitiesWithCombinators}
          caption={[L_GuiAssemblySettings.ReplaceInfinityWithCombinators]}
          tooltip={[L_GuiAssemblySettings.ReplaceInfinityWithCombinatorsTooltip]}
          styleMod={highlightIfOverriden(settings.replaceInfinityEntitiesWithCombinators)}
        />
      </flow>
    )
  }

  private static editingForStage(this: void, name: string): LocalisedString {
    return [L_GuiAssemblySettings.EditingForStage, name]
  }

  private editGridSettings(settings: AssemblyOrStageBlueprintSettings, stage: Stage | nil) {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const stageToUse = stage ?? this.assembly.getStage(this.assembly.maxStage())!
    const name = stage ? stage.name.get() : "Defaults (only grid settings saved)"
    editInItemBlueprintSettings(player, settings, stageToUse.surface, stageToUse.getBlueprintBBox(), name)
  }

  private editFilter(settings: AssemblyOrStageBlueprintSettings, type: "additionalWhitelist" | "blacklist") {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    editBlueprintFilters(player, settings, type)
  }

  private anyGridSettingsChanged(stage: Stage): Property<unknown> {
    const stageSettings = stage.stageBlueprintSettings
    return multiMap(
      funcRef(AssemblySettings.anyNotNil),
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
        <label caption={[L_GuiAssemblySettings.CurrentStage]} style="caption_label" />
        <button
          caption={[L_GuiAssemblySettings.GetBlueprint]}
          styleMod={{ width: BpSettingsButtonWidth }}
          on_gui_click={ibind(this.getBlueprint)}
        />
        <line />
        <button
          caption={[L_GuiAssemblySettings.MakeBlueprintBook]}
          tooltip={[L_GuiAssemblySettings.MakeBlueprintBookTooltip]}
          styleMod={{ width: BpSettingsButtonWidth }}
          on_gui_click={ibind(this.makeBlueprintBook)}
        />
        <button
          caption={[L_GuiAssemblySettings.ExportBlueprintBookStringToFile]}
          tooltip={[L_GuiAssemblySettings.ExportBlueprintBookStringToFileTooltip]}
          styleMod={{ width: BpSettingsButtonWidth }}
          on_gui_click={ibind(this.exportBlueprintBookStringToFile)}
        />
      </flow>
    )
  }

  private getBlueprint() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage || stage.assembly != this.assembly) return
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
    const successful = makeBlueprintBook(this.assembly, stack)
    if (!successful) {
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintBookEmpty],
        create_at_cursor: true,
      })
      return
    }
  }

  private exportBlueprintBookStringToFile() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const fileName = exportBlueprintBookToFile(this.assembly, player)
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
          style="red_button"
          caption={[L_GuiAssemblySettings.DeleteAssembly]}
          on_gui_click={ibind(this.beginDelete)}
        />
        <VerticalPusher />
        <button style="mini_button" tooltip="super secret setting" on_gui_click={ibind(this.sss)} />
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

  private sssCount = 0

  private sss() {
    this.sssCount++
    if (this.sssCount >= 3) {
      const player = game.get_player(this.playerIndex)
      if (!player) return
      player.play_sound({ path: Prototypes.BANANA })
      this.sssCount = 0
    }
  }
}

@RegisterClass("gui:StageSettings")
export class StageSettings extends Component<{ stage: Stage }> {
  playerIndex!: PlayerIndex
  stage!: Stage
  public override render(props: { stage: Stage }, context: RenderContext): Element {
    this.stage = props.stage
    this.playerIndex = context.playerIndex

    return (
      <>
        <frame style="subheader_frame" direction="horizontal">
          <ItemRename
            name={props.stage.name}
            displayName={props.stage.name}
            renameTooltip={[L_GuiAssemblySettings.RenameStage]}
            maximalWidth={AssemblySettingsTabWidth}
          />
          <HorizontalPusher />
          <TrashButton
            tooltip={[L_GuiAssemblySettings.DeleteStage]}
            enabled={this.stage.assembly.maxStage() > 1}
            on_gui_click={ibind(this.beginDelete)}
          />
        </frame>
        <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
          <label style="caption_label" caption={[L_GuiAssemblySettings.Entities]} />
          <button
            styleMod={{ width: StageSettingsButtonWidth }}
            caption={[L_GuiAssemblySettings.ResetStage]}
            tooltip={[L_GuiAssemblySettings.ResetStageTooltip]}
            on_gui_click={ibind(this.resetStage)}
          />
          <flow>
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiAssemblySettings.DisableAllEntities]}
              on_gui_click={ibind(this.disableAllEntities)}
            />
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiAssemblySettings.EnableAllEntities]}
              on_gui_click={ibind(this.enableAllEntities)}
            />
          </flow>

          <line />

          <label style="caption_label" caption={[L_GuiAssemblySettings.SetTiles]} />
          <button
            styleMod={{ width: StageSettingsButtonWidth }}
            caption={[L_GuiAssemblySettings.LabTiles]}
            on_gui_click={ibind(this.setLabTiles)}
          />
          <flow>
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiAssemblySettings.LandfillAndWater]}
              on_gui_click={ibind(this.setLandfillAndWater)}
            />
            <button
              styleMod={{ width: StageSettingsButtonWidth }}
              caption={[L_GuiAssemblySettings.LandfillAndLab]}
              on_gui_click={ibind(this.setLandfillAndLabTiles)}
            />
          </flow>
        </flow>
      </>
    )
  }
  private resetStage() {
    const stage = this.stage
    if (stage.valid) resetStage(stage.assembly, stage.stageNumber)
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
    const stage = this.stage
    if (!stage.valid) return
    const success = stage.autoSetTiles(type)
    if (!success) {
      game.get_player(this.playerIndex)?.create_local_flying_text({
        text: [L_GuiAssemblySettings.FailedToSetTiles],
        create_at_cursor: true,
      })
    }
  }

  private disableAllEntities() {
    const stage = this.stage
    if (!stage.valid) return
    disableAllEntitiesInStage(stage.assembly, stage.stageNumber)
  }

  private enableAllEntities() {
    const stage = this.stage
    if (!stage.valid) return
    enableAllEntitiesInStage(stage.assembly, stage.stageNumber)
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

const AssemblySettingsHeight = StageListBoxHeight + 120
const AssemblySettingsWidth = StageListBoxWidth + AssemblySettingsTabWidth + 30

const AssemblySettingsName = `${script.mod_name}:assembly-settings`
const DefaultAssemblySettingsLoc = { x: 0, y: 350 }
function renderAtAssemblySettingsLoc(player: LuaPlayer, spec: Element): void {
  const existing = player.gui.screen[AssemblySettingsName]
  const loc = existing?.location ?? DefaultAssemblySettingsLoc
  const element = renderNamed(spec, player.gui.screen, AssemblySettingsName)!
  element.location = loc

  element.bring_to_front()
}

function renderPlaceholder(player: LuaPlayer) {
  renderAtAssemblySettingsLoc(
    player,
    <flow
      direction="vertical"
      styleMod={{
        width: AssemblySettingsWidth,
        height: AssemblySettingsHeight,
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

export function bringSettingsWindowToFront(player: LuaPlayer): void {
  const element = player.gui.screen[AssemblySettingsName]
  if (element) element.bring_to_front()
}
export function refreshCurrentAssembly(): void {
  for (const [, player] of game.players) {
    const currentStage = playerCurrentStage(player.index).get()
    renderGuiForAssembly(player, currentStage?.assembly)
  }
}
Migrations.to("0.15.1", () => {
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

Migrations.fromAny(refreshCurrentAssembly)

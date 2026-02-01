// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString, PlayerIndex } from "factorio:runtime"
import {
  exportBlueprintBookToFile,
  exportBlueprintBookToString,
  submitProjectBlueprintBookTask,
} from "../../blueprints/blueprint-creation"
import { BlueprintSettingsTable } from "../../blueprints/blueprint-settings"
import { editInItemBlueprintSettings } from "../../blueprints/edit-blueprint-settings"
import { correctStageReferenceRecursive } from "../../blueprints/stage-reference"
import { Colors } from "../../constants"
import { bind, funcRef, ibind, multiMap, Property, RegisterClass, registerFunctions } from "../../lib"
import { Component, Element, ElemProps, FactorioJsx, RenderContext } from "../../lib/factoriojsx"
import { Fn, showDialog } from "../../lib/factoriojsx/components"
import { L_GuiProjectSettings, L_Interaction } from "../../locale"
import { Stage, Project } from "../../project/Project"
import { highlightIfNotNil, highlightIfOverriden } from "../../utils/DiffedProperty"
import { ManualRevertButton, MaybeRevertButton } from "../../utils/RevertButton"
import { exportProjectToString } from "../blueprint-string"
import { CheckboxTextfield } from "../components/CheckboxTextfield"
import { createStageBlueprint } from "../create-stage-blueprint"
import { editBlueprintFilters } from "../edit-blueprint-filters"
import { IconsEdit } from "../IconEdit"
import { playerCurrentStage } from "../player-current-stage"
import { renderStageReferencePanel } from "../StageReferencesBox"
import { BpExportButtonWidth } from "./shared-constants"

function editingForStage(this: void, name: string): LocalisedString {
  return [L_GuiProjectSettings.EditingForStage, name]
}

function filterTableSizeFn(this: void, set: ReadonlyLuaSet<any> | nil): string {
  if (set == nil) return ""
  return `(${table_size(set)} entities)`
}

function anyNotNil(this: void, a: unknown, b: unknown, c: unknown, d: unknown) {
  return a || b || c || d
}

registerFunctions("gui:BlueprintSettingsTab", { editingForStage, filterTableSizeFn, anyNotNil })

export function EditButton(props: ElemProps<"button">): Element {
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

@RegisterClass("gui:BlueprintSettingsTab")
export class BlueprintSettingsTab extends Component<{ project: Project }> {
  project!: Project
  playerIndex!: PlayerIndex

  override render(props: { project: Project }, context: RenderContext): Element {
    this.project = props.project
    this.playerIndex = context.playerIndex

    return (
      <flow
        direction="vertical"
        styleMod={{
          vertical_spacing: 0,
        }}
      >
        <tabbed-pane
          style="tabbed_pane_with_no_side_padding"
          styleMod={{
            horizontally_stretchable: true,
            bottom_margin: -10,
          }}
          onCreate={(e) => (e.selected_tab_index = 1)}
        >
          <tab caption={[L_GuiProjectSettings.BpExport]} />
          {this.bpExportTab()}
          <tab caption={[L_GuiProjectSettings.BlueprintSettingsDefaults]} />
          {this.bpSettings(nil)}
          <tab
            caption={[L_GuiProjectSettings.BlueprintSettingsCurrentStage]}
            tooltip={[L_GuiProjectSettings.BlueprintSettingsCurrentStageTooltip]}
          />
          <Fn uses="flow" from={playerCurrentStage(this.playerIndex)} map={ibind(this.bpSettings)} />
        </tabbed-pane>
      </flow>
    )
  }

  private bpSettings(stage: Stage | nil): Element {
    const settings: BlueprintSettingsTable =
      stage == nil ? this.project.settings.defaultBlueprintSettings : stage.getBlueprintSettingsView()

    return (
      <flow direction="vertical" styleMod={{ padding: 10, bottom_padding: 20 }}>
        <label
          caption={
            stage == nil
              ? [L_GuiProjectSettings.EditingDefaults]
              : stage.getSettings().name.map(funcRef(editingForStage))
          }
          styleMod={{
            font: "heading-2",
            font_color: stage == nil ? [1, 1, 1] : Colors.OverrideHighlight,
          }}
        />
        <line />

        <label caption={[L_GuiProjectSettings.BlueprintSettings]} style="caption_label" />

        <CheckboxTextfield
          captionBefore={[L_GuiProjectSettings.CustomBlueprintName]}
          captionAfter=""
          tooltip={[L_GuiProjectSettings.CustomBlueprintNameTooltip]}
          value={settings.customBlueprintName}
          textfieldWidth={120}
        />
        <IconsEdit settings={settings} />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label
            caption={
              stage == nil ? [L_GuiProjectSettings.GridSettings] : [L_GuiProjectSettings.GridSettingsAndDescription]
            }
            styleMod={stage && highlightIfNotNil(this.anyGridSettingsChanged(stage))}
          />
          <EditButton on_gui_click={bind(ibind(this.editGridSettingsAndDescription), settings, stage)} />
          {stage && (
            <ManualRevertButton
              visible={this.anyGridSettingsChanged(stage).truthy()}
              on_gui_click={ibind(this.revertAllGridSettings)}
            />
          )}
        </flow>

        <line />
        <label caption={[L_GuiProjectSettings.EntityFilters]} style="caption_label" />
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <label caption={[L_GuiProjectSettings.Denylist]} styleMod={highlightIfOverriden(settings.blacklist)} />
          <label caption={settings.blacklist.map(funcRef(filterTableSizeFn))} />
          <EditButton on_gui_click={bind(ibind(this.editFilter), settings, "blacklist")} />
          {MaybeRevertButton(settings.blacklist)}
        </flow>
        <flow direction="vertical" styleMod={{ vertical_spacing: 0 }}>
          <CheckboxTextfield
            captionBefore={[L_GuiProjectSettings.IncludeEntitiesInTheNextNStages1]}
            captionAfter={[L_GuiProjectSettings.IncludeEntitiesInTheNextNStages2]}
            tooltip={[L_GuiProjectSettings.IncludeEntitiesInTheNextNStagesTooltip]}
            value={settings.stageLimit}
            numeric
          />
          <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
            <label
              caption={[L_GuiProjectSettings.OrInAllowlist]}
              styleMod={{
                left_margin: 28,
                ...highlightIfOverriden(settings.additionalWhitelist),
              }}
              enabled={settings.stageLimit.truthy()}
            />
            <label caption={settings.additionalWhitelist.map(funcRef(filterTableSizeFn))} />
            <EditButton
              on_gui_click={bind(ibind(this.editFilter), settings, "additionalWhitelist")}
              enabled={settings.stageLimit.truthy()}
            />
            {MaybeRevertButton(settings.additionalWhitelist)}
          </flow>
        </flow>
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <checkbox
            state={settings.excludeFromFutureBlueprints}
            caption={[L_GuiProjectSettings.ExcludeFromFutureBlueprints]}
            tooltip={[L_GuiProjectSettings.ExcludeFromFutureBlueprintsTooltip]}
            styleMod={highlightIfOverriden(settings.excludeFromFutureBlueprints)}
          />
          {MaybeRevertButton(settings.excludeFromFutureBlueprints)}
        </flow>
      </flow>
    )
  }

  private editGridSettingsAndDescription(settings: BlueprintSettingsTable, stage: Stage | nil) {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const takeSettingsStage = stage ?? this.project.getStage(this.project.settings.stageCount())!
    const name = stage?.getSettings().name.get() ?? "Defaults"
    const stageBpSettings = stage ? stage.getSettings().stageBlueprintSettings : nil
    const successful = editInItemBlueprintSettings(
      player,
      settings,
      stageBpSettings,
      takeSettingsStage.getSurface(),
      takeSettingsStage.getBlueprintBBox(),
      name,
    )

    if (!successful) {
      player.create_local_flying_text({
        text: [L_Interaction.BlueprintEmpty],
        create_at_cursor: true,
      })
    }
  }

  private editFilter(settings: BlueprintSettingsTable, type: "additionalWhitelist" | "blacklist") {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    editBlueprintFilters(player, settings[type])
  }

  private anyGridSettingsChanged(stage: Stage): Property<unknown> {
    const overrideSettings = stage.getSettings().blueprintOverrideSettings
    return multiMap(
      funcRef(anyNotNil),
      overrideSettings.snapToGrid,
      overrideSettings.positionOffset,
      overrideSettings.absoluteSnapping,
      overrideSettings.positionRelativeToGrid,
    )
  }

  private revertAllGridSettings() {
    const stage = playerCurrentStage(this.playerIndex).get()
    if (!stage) return
    const overrideSettings = stage.getSettings().blueprintOverrideSettings
    overrideSettings.snapToGrid.set(nil)
    overrideSettings.positionOffset.set(nil)
    overrideSettings.absoluteSnapping.set(nil)
    overrideSettings.positionRelativeToGrid.set(nil)
  }

  private bpExportTab(): Element {
    return (
      <flow
        direction="vertical"
        styleMod={{
          padding: [5, 10],
        }}
      >
        <button caption={[L_GuiProjectSettings.GetBlueprintForCurrentStage]} on_gui_click={ibind(this.getBlueprint)} />
        <line />
        <label style="caption_label" caption={[L_GuiProjectSettings.BlueprintBook]} />
        <button
          caption={[L_GuiProjectSettings.ExportBlueprintBook]}
          tooltip={[L_GuiProjectSettings.ExportBlueprintBookTooltip]}
          styleMod={{ width: BpExportButtonWidth }}
          on_gui_click={ibind(this.exportBlueprintBook)}
        />
        <flow direction="horizontal">
          <button
            caption={[L_GuiProjectSettings.ExportBlueprintBookToString]}
            styleMod={{ width: BpExportButtonWidth }}
            on_gui_click={ibind(this.exportBookToString)}
          />
          <button
            caption={[L_GuiProjectSettings.ExportBlueprintBookToFile]}
            tooltip={[L_GuiProjectSettings.ExportBlueprintBookToFileTooltip]}
            styleMod={{ width: BpExportButtonWidth }}
            on_gui_click={ibind(this.exportBookToFile)}
          />
        </flow>
        <line />
        <flow direction="horizontal">
          <button
            caption={[L_GuiProjectSettings.EditBlueprintBookTemplate]}
            tooltip={[L_GuiProjectSettings.EditBlueprintBookTemplateTooltip]}
            styleMod={{ width: BpExportButtonWidth }}
            on_gui_click={ibind(this.editBlueprintBookTemplate)}
          />
          <button
            caption={[L_GuiProjectSettings.ResetBlueprintBookTemplate]}
            styleMod={{ width: BpExportButtonWidth }}
            on_gui_click={ibind(this.beginResetBlueprintBookTemplate)}
          />
        </flow>
        <line />
        <button
          caption={[L_GuiProjectSettings.ExportProject]}
          tooltip={[L_GuiProjectSettings.ExportProjectTooltip]}
          on_gui_click={ibind(this.exportProject)}
        />
      </flow>
    )
  }

  private getBlueprint() {
    const player = game.get_player(this.playerIndex)
    if (player) createStageBlueprint(player)
  }

  private exportBlueprintBook() {
    const player = game.get_player(this.playerIndex)
    if (!player || !player.clear_cursor()) return
    const stack = player.cursor_stack
    if (!stack) return
    submitProjectBlueprintBookTask(this.project, stack)
  }

  private editBlueprintBookTemplate() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    renderStageReferencePanel(player, this.project)
    const stack = this.project.settings.blueprintBookTemplate.getOrCreate(
      this.project,
      this.project.settings.projectName.get(),
    )
    correctStageReferenceRecursive(stack)
    player.opened = stack
  }

  private beginResetBlueprintBookTemplate() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    showDialog(player, {
      title: [L_GuiProjectSettings.ResetBlueprintBookTemplate],
      message: [[L_GuiProjectSettings.ResetBlueprintBookTemplateConfirmation]],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.reset"],
      onConfirm: ibind(this.resetBlueprintBookTemplate),
    })
  }

  private resetBlueprintBookTemplate() {
    this.project.settings.blueprintBookTemplate.reset()
  }

  private exportBookToString() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    exportBlueprintBookToString(this.project, player)
  }

  private exportBookToFile() {
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

  private exportProject() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    exportProjectToString(player, this.project)
  }
}

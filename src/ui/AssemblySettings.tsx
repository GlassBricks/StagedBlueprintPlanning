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
import { AutoSetTilesType } from "../assembly/tiles"
import { WorldUpdater } from "../assembly/WorldUpdater"
import { getStageToMerge } from "../entity/AssemblyEntity"
import { funcRef, ibind, PRecord, RegisterClass, registerFunctions } from "../lib"
import { Component, destroy, Element, FactorioJsx, RenderContext, renderNamed } from "../lib/factoriojsx"
import {
  CollapseButton,
  DraggableSpace,
  ExpandButton,
  Fn,
  HorizontalPusher,
  showDialog,
  TitleBar,
  VerticalPusher,
} from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiAssemblySettings } from "../locale"
import { ItemRename } from "./ItemRename"
import {
  PlayerChangedStageEvent,
  playerCurrentStage,
  recordLastStagePosition,
  teleportToStage,
  teleportToSurface1,
} from "./player-current-stage"
import { StageSelector } from "./StageSelector"
import { Prototypes } from "../constants"

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

const AssemblySettingsTabWidth = 600

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
            styleMod={{
              right_margin: 5,
            }}
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
              }}
            >
              <tab caption={[L_GuiAssemblySettings.Stage]} />
              {this.StagesTab()}
              <tab caption={[L_GuiAssemblySettings.Blueprints]} />
              {/*todo: {this.BlueprintSettingsTab()}*/}
              <empty-widget />
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
    // todo
    // const assemblyBlueprintSettings = this.assembly.assemblyBlueprintSettings
    // return (
    //   <flow direction="vertical" styleMod={{ padding: [5, 10] }}>
    //     <label style="caption_label" caption={[L_GuiAssemblySettings.CurrentStage]} />
    //     <flow>
    //       <button
    //         styleMod={{ width: StageSettingsButtonWidth }}
    //         caption={[L_GuiAssemblySettings.EditBlueprint]}
    //         tooltip={[L_GuiAssemblySettings.EditBlueprintTooltip]}
    //         on_gui_click={ibind(this.editBlueprint)}
    //       />
    //       <button
    //         styleMod={{ width: StageSettingsButtonWidth }}
    //         caption={[L_GuiAssemblySettings.GetBlueprint]}
    //         tooltip={[L_GuiAssemblySettings.GetBlueprintTooltip]}
    //         on_gui_click={ibind(this.getBlueprint)}
    //       />
    //     </flow>
    //     <label
    //       style="caption_label"
    //       caption={[L_GuiAssemblySettings.BlueprintSettings]}
    //       tooltip={[L_GuiAssemblySettings.BlueprintSettingsTooltip]}
    //     />
    //     <checkbox
    //       state={assemblyBlueprintSettings.emptyBlueprintNames}
    //       caption={[L_GuiAssemblySettings.EmptyBlueprintNames]}
    //     />
    //     <line />
    //     <checkbox
    //       state={assemblyBlueprintSettings.autoLandfill}
    //       caption={[L_GuiAssemblySettings.AutoLandfill]}
    //       tooltip={[L_GuiAssemblySettings.AutoLandfillTooltip]}
    //     />
    //     <checkbox
    //       state={assemblyBlueprintSettings.replaceInfinityWithCombinators}
    //       caption={[L_GuiAssemblySettings.ReplaceInfinityWithCombinators]}
    //       tooltip={[L_GuiAssemblySettings.ReplaceInfinityWithCombinatorsTooltip]}
    //     />
    //     <button
    //       caption={[L_GuiAssemblySettings.EditBlueprintFilters]}
    //       tooltip={[L_GuiAssemblySettings.EditBlueprintFiltersTooltip]}
    //       on_gui_click={ibind(this.editBlueprintFilters)}
    //       styleMod={{ width: BpSettingsButtonWidth }}
    //     />
    //     <line />
    //     <button
    //       caption={[L_GuiAssemblySettings.SyncGridSettings]}
    //       tooltip={[L_GuiAssemblySettings.SyncGridSettingsDescription]}
    //       on_gui_click={ibind(this.syncGridSettings)}
    //       styleMod={{ width: BpSettingsButtonWidth }}
    //     />
    //
    //     <label style="caption_label" caption={[L_GuiAssemblySettings.BlueprintBookSettings]} />
    //
    //     <checkbox
    //       state={assemblyBlueprintSettings.emptyBlueprintBookName}
    //       caption={[L_GuiAssemblySettings.EmptyBlueprintBookName]}
    //     />
    //     <checkbox
    //       state={assemblyBlueprintSettings.useNextStageTiles}
    //       caption={[L_GuiAssemblySettings.UseNextStageTiles]}
    //       tooltip={[L_GuiAssemblySettings.UseNextStageTilesTooltip]}
    //     />
    //     <button
    //       caption={[L_GuiAssemblySettings.GetBlueprintBook]}
    //       on_gui_click={ibind(this.getBlueprintBook)}
    //       styleMod={{ width: BpSettingsButtonWidth }}
    //     />
    //     <button
    //       caption={[L_GuiAssemblySettings.ExportBlueprintBookStringToFile]}
    //       tooltip={[L_GuiAssemblySettings.ExportBlueprintBookStringToFileTooltip]}
    //       on_gui_click={ibind(this.exportBlueprintBookStringToFile)}
    //       styleMod={{ width: BpSettingsButtonWidth }}
    //     />
    //   </flow>
    // )
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

  // todo
  // private getBlueprint() {
  //   const stage = playerCurrentStage(this.playerIndex).get()
  //   if (!stage || stage.assembly != this.assembly) return
  //   const player = game.get_player(this.playerIndex)
  //   if (!player) return
  //   const cursorStack = player.cursor_stack
  //   if (!cursorStack || !player.clear_cursor()) return
  //   const took = stage.takeBlueprint(cursorStack)
  //   if (!took) {
  //     cursorStack.clear()
  //     return player.create_local_flying_text({
  //       text: [L_Interaction.BlueprintEmpty],
  //       create_at_cursor: true,
  //     })
  //   }
  // }
  //
  // private editBlueprint() {
  //   const stage = playerCurrentStage(this.playerIndex).get()
  //   if (!stage || stage.assembly != this.assembly) return
  //   const player = game.get_player(this.playerIndex)
  //   if (!player) return
  //   if (!stage.editBlueprint(player)) {
  //     return player.create_local_flying_text({
  //       text: [L_Interaction.BlueprintEmpty],
  //       create_at_cursor: true,
  //     })
  //   }
  // }

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

  // todo
  // private getBlueprintBook() {
  //   const player = game.get_player(this.playerIndex)
  //   if (!player || !player.clear_cursor()) return
  //   const cursor = player.cursor_stack
  //   if (!cursor || !player.is_cursor_empty()) return
  //   if (!this.assembly.makeBlueprintBook(cursor)) {
  //     cursor.clear()
  //     player.create_local_flying_text({
  //       text: [L_Interaction.BlueprintBookEmpty],
  //       create_at_cursor: true,
  //     })
  //   }
  // }
  // private exportBlueprintBookStringToFile() {
  //   const player = game.get_player(this.playerIndex)
  //   if (!player) return
  //   const fileName = exportBlueprintBookToFile(player, this.assembly)
  //   if (fileName) {
  //     player.print([L_Interaction.BlueprintBookExported, fileName])
  //   } else {
  //     player.create_local_flying_text({
  //       text: [L_Interaction.BlueprintBookEmpty],
  //       create_at_cursor: true,
  //     })
  //   }
  // }

  private sssCount = 0
  private static sssText: PRecord<number, string> = {
    6: "banana",
    9: "BANANA",
    12: "BANANANA",
    15: "AAAAAAAAAAAAAAAAAA",
    18: "A".repeat(50),
  }
  private sss() {
    this.sssCount++
    if (this.sssCount % 3 != 0 && this.sssCount < 12) return
    const player = game.get_player(this.playerIndex)
    if (!player) return
    player.play_sound({ path: Prototypes.BANANA })
    const text = AssemblySettings.sssText[this.sssCount]
    if (text)
      player.create_local_flying_text({
        text,
        create_at_cursor: true,
      })
    if (this.sssCount == 21) {
      this.sssCount = 0
      error("BANANA OVERLOAD")
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

          <line />

          <VerticalPusher />
          <button
            style="red_button"
            styleMod={{ width: StageSettingsButtonWidth }}
            caption={[L_GuiAssemblySettings.DeleteStage]}
            enabled={this.stage.assembly.maxStage() > 1}
            on_gui_click={ibind(this.beginDelete)}
          />
        </flow>
      </>
    )
  }
  private resetStage() {
    const stage = this.stage
    if (stage.valid) WorldUpdater.resetStage(stage.assembly, stage.stageNumber)
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
    WorldUpdater.disableAllEntities(stage.assembly, stage.stageNumber)
  }

  private enableAllEntities() {
    const stage = this.stage
    if (!stage.valid) return
    WorldUpdater.enableAllEntities(stage.assembly, stage.stageNumber)
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

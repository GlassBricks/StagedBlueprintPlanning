// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, OnGuiClickEvent, PlayerIndex } from "factorio:runtime"
import { funcRef, ibind, onPlayerInitSince, Property, property, RegisterClass, registerFunctions } from "../../lib"
import { Component, Element, FactorioJsx, RenderContext, renderNamed } from "../../lib/factoriojsx"
import { CollapseButton, DraggableSpace, ExpandButton, TitleBar } from "../../lib/factoriojsx/components"
import { Migrations } from "../../lib/migration"
import { L_GuiProjectSettings } from "../../locale"
import { Project } from "../../project/Project"
import { ItemRename } from "../ItemRename"
import { PlayerChangedStageEvent, playerCurrentStage, teleportToStage } from "../player-current-stage"
import { StageSelector } from "../StageSelector"
import { BlueprintSettingsTab } from "./BlueprintSettingsTab"
import { EditorTab } from "./EditorTab"
import { ProjectSettingsTabWidth } from "./shared-constants"
import { StageSettingsTab } from "./StageSettingsTab"

declare global {
  interface PlayerData {
    compactProjectSettings?: true
    projectSettingsSelectedTab: Property<number>
  }
}
declare const storage: StorageWithPlayer

onPlayerInitSince("0.23.0", (playerIndex) => {
  const data = storage.players[playerIndex]
  data.projectSettingsSelectedTab = property(1)
})

const StageListBoxHeight = 28 * 12
const StageListBoxWidth = 140

const NewStageBarHeight = 100

function StageListBox(project: Project) {
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
  project: Project
}> {
  project!: Project
  override render({ project }: { project: Project }): Element {
    return (
      <frame direction="vertical">
        <TitleBar>
          <label
            caption={project.settings.displayName(project.id)}
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
  project: Project
}> {
  project!: Project
  playerIndex!: PlayerIndex

  override render(
    props: {
      project: Project
    },
    context: RenderContext,
  ): Element {
    this.project = props.project
    this.playerIndex = context.playerIndex

    const selectedTabIndex = storage.players[this.playerIndex].projectSettingsSelectedTab

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
            name={this.project.settings.projectName}
            displayName={this.project.settings.displayName(this.project.id)}
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
                width: ProjectSettingsTabWidth,
              }}
              selected_tab_index={selectedTabIndex}
            >
              <tab caption={[L_GuiProjectSettings.ProjectSettings]} />
              <StageSettingsTab project={this.project} />
              <tab caption={[L_GuiProjectSettings.Editor]} />
              <EditorTab project={this.project} />
              <tab caption={[L_GuiProjectSettings.Blueprints]} />
              <BlueprintSettingsTab project={this.project} />
            </tabbed-pane>
          </frame>
        </flow>
      </frame>
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

function renderCompactSettings(player: LuaPlayer, project: Project) {
  renderAtProjectSettingsLoc(player, <CompactProjectSettings project={project} />)
}

function renderFullSettings(player: LuaPlayer, project: Project) {
  renderAtProjectSettingsLoc(player, <ProjectSettings project={project} />)
}

function renderGuiForProject(player: LuaPlayer, currentProject: Project | nil): void {
  if (!currentProject) {
    return renderPlaceholder(player)
  }

  if (storage.players[player.index].compactProjectSettings) {
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
  storage.players[player_index].compactProjectSettings = nil
  updateGui(game.get_player(player_index)!)
}

function collapseSettings({ player_index }: OnGuiClickEvent) {
  storage.players[player_index].compactProjectSettings = true
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
Migrations.fromAny(refreshCurrentProject)

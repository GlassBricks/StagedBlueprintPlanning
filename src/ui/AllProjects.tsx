// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LuaPlayer, OnGuiClickEvent, PlayerIndex, ScrollPaneGuiElement } from "factorio:runtime"
import * as mod_gui from "mod-gui"
import { Styles } from "../constants"
import { bind, ibind, RegisterClass } from "../lib"
import {
  Component,
  destroy,
  destroyChildren,
  Element,
  EmptyProps,
  FactorioJsx,
  getComponentInstance,
  render,
  RenderContext,
  renderNamed,
} from "../lib/factoriojsx"
import {
  closeParentAtLevel,
  HorizontalPusher,
  showDialog,
  SimpleTitleBar,
  TrashButton,
} from "../lib/factoriojsx/components"
import { L_Gui, L_GuiProjectSelector, L_GuiProjectSettings } from "../locale"
import { ProjectCreatedEvent, ProjectDeletedEvent, ProjectsReorderedEvent, UserProject } from "../project/ProjectDef"
import { getAllProjects, moveProjectDown, moveProjectUp, ProjectEvents } from "../project/UserProject"
import { showImportBlueprintWindow } from "./blueprint-string"
import { openNewProjectDialog } from "./NewProjectDialog"
import { exitProject, PlayerChangedStageEvent, playerCurrentStage, teleportToProject } from "./player-current-stage"
import { bringSettingsWindowToFront } from "./ProjectSettings"
import mouse_button_type = defines.mouse_button_type
import { AllProjectsName, closeAllProjects } from "./AllProjectsDec"

declare const storage: StorageWithPlayer & {
  researchTechPromptDismissed?: true
}

const AllProjectsWidth = 150
const AllProjectsMaxWidth = 300
const AllProjectsHeight = 28 * 10
@RegisterClass("gui:AllProjects")
class AllProjects extends Component {
  playerIndex!: PlayerIndex
  scrollPane!: ScrollPaneGuiElement

  override render(_: EmptyProps, context: RenderContext): Element {
    this.playerIndex = context.playerIndex
    const currentStage = playerCurrentStage(this.playerIndex)
    return (
      <flow direction="vertical">
        <frame
          direction="vertical"
          styleMod={{
            horizontally_stretchable: false,
          }}
        >
          <SimpleTitleBar title={[L_GuiProjectSelector.AllProjects]} frameLevel={3} />
          <frame
            direction="vertical"
            style="inside_deep_frame"
            styleMod={{
              vertically_stretchable: true,
              horizontally_stretchable: true,
              bottom_margin: 8,
            }}
          >
            <scroll-pane
              style={Styles.FakeListBox}
              horizontal_scroll_policy={"never"}
              vertical_scroll_policy={"auto-and-reserve-space"}
              styleMod={{
                height: AllProjectsHeight,
                minimal_width: AllProjectsWidth,
                maximal_width: AllProjectsMaxWidth,
                horizontally_stretchable: true,
              }}
              onCreate={(e) => {
                this.scrollPane = e
                this.scrollToCurrentProject()
              }}
            >
              {getAllProjects().map((project) => this.projectButtonFlow(project))}
            </scroll-pane>
          </frame>
          <button
            caption={[L_GuiProjectSelector.NewProject]}
            on_gui_click={ibind(this.newProject)}
            styleMod={{ horizontally_stretchable: true }}
          />
          <button
            caption={[L_Gui.ImportProjectFromString]}
            tooltip={[L_Gui.ImportProjectFromStringTooltip]}
            styleMod={{ horizontally_stretchable: true }}
            on_gui_click={ibind(this.importProject)}
          />
          <button
            caption={[L_GuiProjectSelector.ExitProject]}
            enabled={currentStage.truthy()}
            styleMod={{ horizontally_stretchable: true }}
            on_gui_click={ibind(this.exitProject)}
          />
        </frame>
        {storage.researchTechPromptDismissed != true && (
          <frame direction="horizontal" caption={[L_GuiProjectSelector.ResearchAllTechPrompt]}>
            <button
              caption={[L_GuiProjectSelector.NoResearchAllTech]}
              on_gui_click={ibind(this.dismissResearchTechPrompt)}
            />
            <HorizontalPusher />
            <button caption={[L_GuiProjectSelector.YesResearchAllTech]} on_gui_click={ibind(this.researchAllTech)} />
          </frame>
        )}
      </flow>
    )
  }

  private dismissResearchTechPrompt(event: OnGuiClickEvent): void {
    storage.researchTechPromptDismissed = true
    closeParentAtLevel(1, event)
  }

  private researchAllTech(event: OnGuiClickEvent): void {
    game.forces.player.research_all_technologies()
    storage.researchTechPromptDismissed = true
    closeParentAtLevel(1, event)
  }

  private projectButtonFlow(project: UserProject) {
    return <flow tags={{ projectId: project.id }}>{this.projectButton(project)}</flow>
  }

  private projectButton(project: UserProject) {
    const currentProject = playerCurrentStage(this.playerIndex).get()?.project
    return (
      <flow
        direction="horizontal"
        styleMod={{
          horizontal_spacing: 0,
          horizontally_stretchable: true,
        }}
      >
        <button
          style={project == currentProject ? Styles.FakeListBoxItemActive : Styles.FakeListBoxItem}
          caption={project.displayName()}
          tooltip={[L_GuiProjectSelector.ButtonTooltip]}
          on_gui_click={bind(AllProjects.onButtonClick, project)}
        />
        <TrashButton
          on_gui_click={bind(ibind(this.beginDeleteProject), project)}
          tooltip={[L_GuiProjectSettings.DeleteProject]}
        />
      </flow>
    )
  }

  private scrollToCurrentProject() {
    const currentProject = playerCurrentStage(this.playerIndex).get()?.project
    if (!currentProject) return
    const element = this.scrollPane
    if (!element || !element.valid) return
    const flow = this.scrollPane.children.find((c) => c.tags?.projectId == currentProject.id)
    if (flow) {
      element.scroll_to_element(flow)
    }
  }

  private static onButtonClick(this: void, project: UserProject, event: OnGuiClickEvent): void {
    // control left-click: move up
    // control right-click: move down
    // normal click: teleport
    if (event.control) {
      if (event.button == mouse_button_type.left) {
        moveProjectUp(project)
      } else if (event.button == mouse_button_type.right) {
        moveProjectDown(project)
      }
      return
    }
    const playerIndex = event.player_index
    const player = game.get_player(playerIndex)!
    teleportToProject(player, project)
    bringSettingsWindowToFront(player)
  }

  private newProject(): void {
    const player = game.get_player(this.playerIndex)!
    openNewProjectDialog(player)
  }

  private exitProject(): void {
    const player = game.get_player(this.playerIndex)!
    closeAllProjects(player)
    exitProject(player)
  }

  private beginDeleteProject(project: UserProject) {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    showDialog(player, {
      title: [L_GuiProjectSettings.DeleteProject],
      message: [
        [L_GuiProjectSettings.DeleteProjectConfirmation1, project.displayName().get()],
        [L_GuiProjectSettings.DeleteProjectConfirmation2],
      ],
      redConfirm: true,
      backCaption: ["gui.cancel"],
      confirmCaption: ["gui.delete"],
      onConfirm: bind(ibind(this.deleteProject), project),
    })
  }

  private deleteProject(project: UserProject) {
    exitProject(game.get_player(this.playerIndex)!)
    project.delete()
  }

  private importProject(): void {
    const player = game.get_player(this.playerIndex)!
    showImportBlueprintWindow(player)
  }

  projectChangedEvent(e: ProjectCreatedEvent | ProjectDeletedEvent | ProjectsReorderedEvent) {
    const element = this.scrollPane
    if (!element || !element.valid) return
    if (e.type == "project-created") {
      render(this.projectButtonFlow(e.project), element)
      this.scrollToCurrentProject()
    } else if (e.type == "project-deleted") {
      const flow = element.children.find((c) => c.tags.projectId == e.project.id)
      if (flow) destroy(flow)
    } else if (e.type == "projects-reordered") {
      const children = element.children
      const index1 = children.findIndex((c) => c.tags.projectId == e.project1.id)
      const index2 = children.findIndex((c) => c.tags.projectId == e.project2.id)
      if (index1 == -1 || index2 == -1) return
      element.swap_children(index1 + 1, index2 + 1)
      this.scrollToCurrentProject()
    }
  }

  private rerenderProject(project: UserProject) {
    const element = this.scrollPane
    if (!element || !element.valid) return
    const flow = element.children.find((c) => c.tags.projectId == project.id)
    if (flow) {
      destroyChildren(flow)
      render(this.projectButton(project), flow)
    }
  }

  playerProjectChanged(oldProject: UserProject | nil, newProject: UserProject | nil) {
    if (oldProject) this.rerenderProject(oldProject)
    if (newProject) this.rerenderProject(newProject)
    this.scrollToCurrentProject()
  }
}

export function toggleAllProjects(player: LuaPlayer): void {
  const flow = mod_gui.get_frame_flow(player)
  const allProjects = flow[AllProjectsName]
  if (allProjects) {
    destroy(allProjects)
  } else {
    renderNamed(<AllProjects />, flow, AllProjectsName)
  }
}

ProjectEvents.addListener((e) => {
  if (e.type == "project-created" || e.type == "project-deleted" || e.type == "projects-reordered") {
    for (const [, player] of game.players) {
      const element = mod_gui.get_frame_flow(player)[AllProjectsName]
      if (!element) continue
      const component = getComponentInstance<AllProjects>(element)
      if (component) component.projectChangedEvent(e)
    }
  }
})
PlayerChangedStageEvent.addListener((player, oldStage, newStage) => {
  const oldProject = oldStage?.project
  const newProject = newStage?.project
  if (oldProject != newProject) {
    const element = mod_gui.get_frame_flow(player)[AllProjectsName]
    if (!element) return
    const component = getComponentInstance<AllProjects>(element)
    if (component) component.playerProjectChanged(oldProject, newProject)
  }
})

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

import { LuaGuiElement, LuaPlayer, OnGuiClickEvent, PlayerIndex, ScrollPaneGuiElement } from "factorio:runtime"
import * as mod_gui from "mod-gui"
import { OtherConstants, Sprites, Styles } from "../constants"
import { bind, funcRef, ibind, onPlayerInitSince, RegisterClass, registerFunctions } from "../lib"
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
import { HorizontalPusher, SimpleTitleBar } from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiProjectSelector } from "../locale"
import { ProjectCreatedEvent, ProjectDeletedEvent, ProjectsReorderedEvent, UserProject } from "../project/ProjectDef"
import {
  createUserProject,
  getAllProjects,
  moveProjectDown,
  moveProjectUp,
  ProjectEvents,
} from "../project/UserProject"
import { exitProject, PlayerChangedStageEvent, playerCurrentStage, teleportToProject } from "./player-current-stage"
import { bringSettingsWindowToFront } from "./ProjectSettings"
import mouse_button_type = defines.mouse_button_type

declare const global: GlobalWithPlayers

function ModButton() {
  return (
    <sprite-button
      style={mod_gui.button_style}
      sprite={Sprites.BlueprintStages}
      tooltip={[L_GuiProjectSelector.ShowAllProjects]}
      on_gui_click={funcRef(onModButtonClick)}
    />
  )
}

const ModButtonName = script.mod_name + ":all-projects"
onPlayerInitSince("0.15.1", (playerIndex) => {
  const player = game.get_player(playerIndex)!
  renderNamed(<ModButton />, mod_gui.get_button_flow(player), ModButtonName)
})

const AllProjectsName = script.mod_name + ":all-projects"
const AllProjectsWidth = 260
const AllProjectsHeight = 28 * 10
@RegisterClass("gui:AllProjects")
class AllProjects extends Component {
  playerIndex!: PlayerIndex
  scrollPane!: ScrollPaneGuiElement

  override render(_: EmptyProps, context: RenderContext): Element {
    this.playerIndex = context.playerIndex
    const currentStage = playerCurrentStage(this.playerIndex)
    return (
      <frame direction="vertical">
        <SimpleTitleBar title={[L_GuiProjectSelector.AllProjects]} />
        <frame
          direction="vertical"
          style="inside_deep_frame"
          styleMod={{ vertically_stretchable: true, bottom_margin: 8 }}
        >
          <scroll-pane
            style={Styles.FakeListBox}
            styleMod={{
              width: AllProjectsWidth,
              height: AllProjectsHeight,
            }}
            onCreate={(e) => {
              this.scrollPane = e
              this.scrollToCurrentProject()
            }}
          >
            {getAllProjects().map((project) => this.projectButtonFlow(project))}
          </scroll-pane>
        </frame>
        <flow direction="horizontal" styleMod={{ vertical_align: "center" }}>
          <button caption={[L_GuiProjectSelector.NewProject]} on_gui_click={ibind(this.newProject)} />
          <HorizontalPusher />
          <button
            caption={[L_GuiProjectSelector.ExitProject]}
            enabled={currentStage.truthy()}
            on_gui_click={ibind(this.exitProject)}
          />
        </flow>
      </frame>
    )
  }

  private projectButtonFlow(project: UserProject) {
    return <flow tags={{ projectId: project.id }}>{this.projectButton(project)}</flow>
  }

  private projectButton(project: UserProject) {
    const currentProject = playerCurrentStage(this.playerIndex).get()?.project
    return (
      <button
        style={project == currentProject ? Styles.FakeListBoxItemActive : Styles.FakeListBoxItem}
        caption={project.displayName()}
        tooltip={[L_GuiProjectSelector.ButtonTooltip]}
        on_gui_click={bind(AllProjects.onButtonClick, project)}
      />
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
    closeAllProjects(playerIndex)
    teleportToProject(player, project)
    bringSettingsWindowToFront(player)
  }

  private newProject(): void {
    closeAllProjects(this.playerIndex)
    createNewProject(game.get_player(this.playerIndex)!)
  }

  private exitProject(): void {
    closeAllProjects(this.playerIndex)
    exitProject(game.get_player(this.playerIndex)!)
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

function createNewProject(player: LuaPlayer): void {
  const project = createUserProject("", OtherConstants.DefaultNumStages)
  global.players[player.index].compactProjectSettings = nil
  teleportToProject(player, project)
}

function getFrameFlow(playerIndex: PlayerIndex) {
  return mod_gui.get_frame_flow(game.get_player(playerIndex)!)
}
export function closeAllProjects(playerIndex: PlayerIndex): void {
  destroy(getFrameFlow(playerIndex)[AllProjectsName])
}
function toggleAllProjects(playerIndex: PlayerIndex): void {
  const flow = getFrameFlow(playerIndex)
  const allProjects = flow[AllProjectsName]
  if (allProjects) {
    destroy(allProjects)
  } else {
    renderNamed(<AllProjects />, flow, AllProjectsName)
  }
}
function onModButtonClick(event: OnGuiClickEvent) {
  toggleAllProjects(event.player_index)
}
registerFunctions("gui:project-selector", { onModButtonClick })

ProjectEvents.addListener((e) => {
  if (e.type == "project-created" || e.type == "project-deleted" || e.type == "projects-reordered") {
    for (const [, player] of game.players) {
      const element = getFrameFlow(player.index)[AllProjectsName]
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
    const element = getFrameFlow(player.index)[AllProjectsName]
    if (!element) return
    const component = getComponentInstance<AllProjects>(element)
    if (component) component.playerProjectChanged(oldProject, newProject)
  }
})

Migrations.to("0.15.1", () => {
  interface OldPlayerData {
    currentAssembliesGui?: {
      mainFlow?: LuaGuiElement
    }
  }
  for (const [playerIndex, playerData] of pairs(global.players)) {
    const oldPlayerData = playerData as OldPlayerData
    destroy(oldPlayerData?.currentAssembliesGui?.mainFlow)
    const player = game.get_player(playerIndex)
    destroy(player?.gui.left[`${script.mod_name}:current-assembly`])
  }
})
Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    closeAllProjects(player.index)
    const flow = mod_gui.get_button_flow(player)
    if (flow[ModButtonName] == nil) renderNamed(<ModButton />, flow, ModButtonName)
  }
})
Migrations.early("0.23.0", () => {
  const oldModButtonName = script.mod_name + ":all-assemblies"
  const oldAllProjectsName = script.mod_name + ":all-assemblies"
  for (const [, player] of game.players) {
    const flow = mod_gui.get_button_flow(player)
    destroy(flow[oldModButtonName])
    const frameFlow = mod_gui.get_frame_flow(player)
    destroy(frameFlow[oldAllProjectsName])
  }
})

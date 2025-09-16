/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { FrameGuiElement, LocalisedString, ProgressBarGuiElement } from "factorio:runtime"
import { L_GuiTasks } from "../locale"
import { Events } from "./Events"
import {
  Component,
  destroy,
  Element,
  FactorioJsx,
  getComponentInstance,
  RenderContext,
  renderNamed,
} from "./factoriojsx"
import { HorizontalPusher } from "./factoriojsx/components"
import { protectedAction } from "./protected-action"
import { funcRef, RegisterClass, registerFunctions } from "./references"

/**
 * A long-running task split over multiple ticks, so the game does not freeze for too long.
 */
export interface Task {
  /** Get the title to be shown to the user */
  getTitle(): LocalisedString
  /** Run one tick. Do nothing if the current task is done.*/
  step(): void
  /** Return whether this task is done. */
  isDone(): boolean
  /** Cancel this task. Called by user */
  cancel(): void
  /** Get a message for what the _next_ task will be. */
  getNextStepTitle(): LocalisedString | nil
  /** Get the current progress as a number between 0 and 1, if known. If included, a progress bar will be shown */
  getProgress(): number | nil
}
export abstract class LoopTask implements Task {
  private nextStep: number = 0

  protected constructor(readonly steps: number) {}

  abstract getTitle(): LocalisedString
  protected abstract doStep(i: number): void
  protected done?(): void
  step(): void {
    if (this.isDone()) return
    this.doStep(this.nextStep++)
    if (this.isDone()) this.done?.()
  }
  isDone(): boolean {
    return this.nextStep >= this.steps
  }
  cancel(): void {
    // default no-op
  }
  getNextStepTitle(): LocalisedString | nil {
    if (this.isDone()) return nil
    return this.getTitleForStep(this.nextStep)
  }
  protected abstract getTitleForStep(step: number): LocalisedString
  getProgress(): number {
    if (this.steps == 0) return 1
    return this.nextStep / this.steps
  }
}

export abstract class EnumeratedItemsTask<T> implements Task {
  private nextIndex: number = 0
  protected constructor(protected tasks: readonly T[]) {}
  abstract getTitle(): LocalisedString
  step(): void {
    if (this.isDone()) return
    this.doTask(this.tasks[this.nextIndex++])
    if (this.isDone()) this.done?.()
  }
  protected abstract doTask(task: T): void
  protected done?(): void
  isDone(): boolean {
    return this.nextIndex >= this.tasks.length
  }
  cancel(): void {
    // default no-op
  }
  getNextStepTitle(): LocalisedString {
    if (this.isDone()) return nil
    return this.getTitleForTask(this.tasks[this.nextIndex])
  }
  protected abstract getTitleForTask(task: T): LocalisedString
  getProgress(): number {
    if (this.tasks.length == 0) return 1
    return this.nextIndex / this.tasks.length
  }
}

declare const storage: {
  currentTask?: Task
}

export function submitTask(task: Task): void {
  if (storage.currentTask) {
    storage.currentTask.cancel()
  }
  if (!game.tick_paused) {
    storage.currentTask = task
    renderTaskGui(task)
  } else {
    // run the entire task in one tick
    destroyTaskGui()
    storage.currentTask = nil
    runEntireTask(task)
  }
}

function stepTask(task: Task) {
  task.step()
  return true
}

export function runEntireTask(task: Task): void {
  while (!task.isDone()) {
    const success = protectedAction(stepTask, task)
    if (!success) {
      task.cancel()
      break
    }
  }
}

export function cancelCurrentTask(): void {
  if (storage.currentTask) {
    storage.currentTask.cancel()
    delete storage.currentTask
    destroyTaskGui()
  }
}
export function isTaskRunning(): boolean {
  return storage.currentTask != nil
}
export function runEntireCurrentTask(): void {
  if (storage.currentTask) {
    runEntireTask(storage.currentTask)
    delete storage.currentTask
    destroyTaskGui()
  }
}

registerFunctions("task", { cancelCurrentTask })
Events.on_tick(() => {
  const task = storage.currentTask
  if (!task) return
  const stepped = protectedAction(stepTask, task)
  if (!stepped) task.cancel()
  if (stepped && !task.isDone()) {
    updateTaskGui(task)
  } else {
    delete storage.currentTask
    destroyTaskGui()
  }
})

@RegisterClass("CurrentTaskGui")
class CurrentTaskGui extends Component<{
  task: Task
}> {
  mainFrame!: FrameGuiElement
  override render(
    {
      task,
    }: {
      task: Task
    },
    context: RenderContext,
  ): Element {
    context.onMount(() => this.update(task))
    return (
      <frame
        caption={task.getTitle()}
        direction={"vertical"}
        onCreate={(e) => (this.mainFrame = e)}
        auto_center
        styleMod={{
          minimal_width: 500,
        }}
      >
        <label name="currentTaskTitle" visible={false} />
        <progressbar
          name="currentTaskProgress"
          value={0}
          visible={false}
          styleMod={{ horizontally_stretchable: true }}
        />
        <flow direction="horizontal">
          <HorizontalPusher />
          <button caption={[L_GuiTasks.Cancel]} on_gui_click={funcRef(cancelCurrentTask)} />
        </flow>
      </frame>
    )
  }

  update(task: Task): void {
    if (!this.mainFrame.valid) return
    const title = task.getNextStepTitle?.()
    const titleElement = this.mainFrame.currentTaskTitle!
    if (title == nil) {
      titleElement.visible = false
    } else {
      titleElement.visible = true
      titleElement.caption = title
    }

    const progress = task.getProgress?.()
    const progressElement = this.mainFrame.currentTaskProgress! as ProgressBarGuiElement
    if (progress == nil) {
      progressElement.visible = false
    } else {
      progressElement.visible = true
      progressElement.value = progress
    }
  }
}

const CurrentTaskGuiName = "bp100_CurrentTaskGui"
function renderTaskGui(task: Task): void {
  for (const [, player] of game.players) {
    renderNamed(<CurrentTaskGui task={task} />, player.gui.screen, CurrentTaskGuiName)
  }
}

function destroyTaskGui(): void {
  for (const [, player] of game.players) {
    destroy(player.gui.screen[CurrentTaskGuiName])
  }
}
function updateTaskGui(task: Task): void {
  for (const [, player] of game.players) {
    const guiElement = player.gui.screen[CurrentTaskGuiName]
    if (!guiElement) continue
    const component = getComponentInstance<CurrentTaskGui>(guiElement)
    component?.update(task)
  }
}

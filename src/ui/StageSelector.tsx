// Copyright (c) 2022 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { DropDownGuiElement, ListBoxGuiElement, LocalisedString, PlayerIndex } from "factorio:runtime"
import { StageNumber } from "../entity/ProjectEntity"
import { assertNever, bind, ibind, MutableProperty, RegisterClass, Subscription } from "../lib"
import { Component, Element, ElemProps, FactorioJsx, RenderContext } from "../lib/factoriojsx"
import { LocalProjectEvent, Stage, UserProject } from "../project/ProjectDef"
import { playerCurrentStage, teleportToStage } from "./player-current-stage"

export type StageSelectorProps<T extends "drop-down" | "list-box"> = {
  uses: T
  project: UserProject
  selectedIndex?: MutableProperty<StageNumber>
} & ElemProps<T>
@RegisterClass("gui:CurrentStage")
export class StageSelector<T extends "drop-down" | "list-box"> extends Component<StageSelectorProps<T>> {
  private project!: UserProject
  private trackerSubscription!: Subscription
  private playerIndex!: PlayerIndex

  private elementSubscription?: Subscription
  private element!: DropDownGuiElement | ListBoxGuiElement

  override render(props: StageSelectorProps<T>, context: RenderContext): Element {
    this.project = props.project

    this.trackerSubscription = context.getSubscription()
    this.playerIndex = context.playerIndex

    context.onMount(() => this.setup())

    return (
      <props.uses
        {...props}
        onCreate={(e) => (this.element = e)}
        on_gui_selection_state_changed={ibind(this.onSelectedIndexChanged)}
      />
    )
  }

  private setup() {
    this.elementSubscription?.close()
    if (!this.element.valid) {
      this.trackerSubscription.close()
      return
    }
    const subscription = (this.elementSubscription = new Subscription())
    this.trackerSubscription.add(subscription)

    const stages = this.project.getAllStages()
    this.element.items = stages.map((l) => l.getSettings().name.get())
    for (const stage of stages) {
      stage.getSettings().name.subscribe(subscription, bind(ibind(this.setDropDownItem), stage.stageNumber))
    }
    playerCurrentStage(this.playerIndex).subscribeAndRaise(subscription, ibind(this.playerStageChanged))

    this.project.localEvents.subscribe(subscription, ibind(this.onProjectEvent))
  }

  private onProjectEvent(event: LocalProjectEvent) {
    if (event.type == "stage-added" || event.type == "stage-deleted") {
      this.setup()
    } else if (event.type != "project-deleted" && event.type != "pre-stage-deleted") {
      assertNever(event)
    }
  }

  private setDropDownItem(stageNumber: StageNumber, name: LocalisedString) {
    if (this.element.valid) {
      this.element.set_item(stageNumber, name)
    } else {
      this.elementSubscription?.close()
      this.trackerSubscription.close()
    }
  }

  private onSelectedIndexChanged() {
    if (!this.project.valid) return
    const index = this.element.selected_index
    const stage = this.project.getStage(index)
    if (!stage) return
    teleportToStage(game.get_player(this.playerIndex)!, stage)
  }

  private playerStageChanged(stage: Stage | nil) {
    if (stage && stage.project == this.project && stage.stageNumber <= this.element.items.length) {
      this.element.selected_index = stage.stageNumber
      if (this.element.type == "list-box") this.element.scroll_to_item(stage.stageNumber)
    } else {
      this.element.selected_index = 0
    }
  }
}

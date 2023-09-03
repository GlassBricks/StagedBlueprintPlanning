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

import { DropDownGuiElement, ListBoxGuiElement, LocalisedString, PlayerIndex } from "factorio:runtime"
import { LocalAssemblyEvent, Stage, UserAssembly } from "../assembly/AssemblyDef"
import { StageNumber } from "../entity/AssemblyEntity"
import { assertNever, bind, ibind, MutableProperty, RegisterClass, Subscription } from "../lib"
import { Component, Element, ElemProps, FactorioJsx, RenderContext } from "../lib/factoriojsx"
import { playerCurrentStage, teleportToStage } from "./player-current-stage"

export type StageSelectorProps<T extends "drop-down" | "list-box"> = {
  uses: T
  assembly: UserAssembly
  selectedIndex?: MutableProperty<StageNumber>
} & ElemProps<T>
@RegisterClass("gui:CurrentStage")
export class StageSelector<T extends "drop-down" | "list-box"> extends Component<StageSelectorProps<T>> {
  private assembly!: UserAssembly
  private trackerSubscription!: Subscription
  private playerIndex!: PlayerIndex

  private elementsSubscription?: Subscription
  private element!: DropDownGuiElement | ListBoxGuiElement

  public override render(props: StageSelectorProps<T>, context: RenderContext): Element {
    this.assembly = props.assembly

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
    this.elementsSubscription?.close()
    const subscription = (this.elementsSubscription = new Subscription())
    this.trackerSubscription.add(subscription)

    const stages = this.assembly.getAllStages()
    this.element.items = stages.map((l) => l.name.get())
    for (const stage of stages) {
      stage.name.subscribe(subscription, bind(ibind(this.setDropDownItem), stage.stageNumber))
    }
    playerCurrentStage(this.playerIndex).subscribeAndRaise(subscription, ibind(this.playerStageChanged))

    this.assembly.localEvents.subscribe(subscription, ibind(this.onAssemblyEvent))
  }

  private onAssemblyEvent(event: LocalAssemblyEvent) {
    if (event.type == "stage-added" || event.type == "stage-deleted") {
      this.setup()
    } else if (event.type != "assembly-deleted" && event.type != "pre-stage-deleted") {
      assertNever(event)
    }
  }

  private setDropDownItem(stageNumber: StageNumber, name: LocalisedString) {
    this.element.set_item(stageNumber, name)
  }

  private onSelectedIndexChanged() {
    if (!this.assembly.valid) return
    const index = this.element.selected_index
    const stage = this.assembly.getStage(index)
    if (!stage) return
    teleportToStage(game.get_player(this.playerIndex)!, stage)
  }

  private playerStageChanged(stage: Stage | nil) {
    if (stage && stage.assembly == this.assembly && stage.stageNumber <= this.element.items.length) {
      this.element.selected_index = stage.stageNumber
      if (this.element.type == "list-box") this.element.scroll_to_item(stage.stageNumber)
    } else {
      this.element.selected_index = 0
    }
  }
}

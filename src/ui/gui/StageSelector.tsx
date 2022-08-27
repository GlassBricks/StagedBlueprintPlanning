/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { clamp } from "util"
import { Assembly, LocalAssemblyEvent, Stage } from "../../assembly/AssemblyDef"
import { StageNumber } from "../../entity/AssemblyEntity"
import { assertNever, bind, funcOn, MutableState, RegisterClass, state, Subscription } from "../../lib"
import { Component, ElemProps, FactorioJsx, Spec, Tracker } from "../../lib/factoriojsx"
import { playerCurrentStage, teleportToStage } from "../player-current-stage"

export type StageSelectorProps<T extends "drop-down" | "list-box"> = {
  uses: T
  assembly: Assembly
  selectedIndex?: MutableState<StageNumber>
} & ElemProps<T>
@RegisterClass("gui:CurrentStage")
export class StageSelector<T extends "drop-down" | "list-box"> extends Component<StageSelectorProps<T>> {
  private assembly!: Assembly
  private trackerSubscription!: Subscription
  private playerIndex!: PlayerIndex

  private elementsSubscription!: Subscription
  private element!: DropDownGuiElement | ListBoxGuiElement
  private selectedIndex!: MutableState<number>

  public override render(props: StageSelectorProps<T>, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.selectedIndex = props.selectedIndex ?? state(0)

    this.trackerSubscription = tracker.getSubscription()
    this.playerIndex = tracker.playerIndex

    this.selectedIndex.set(clamp(this.selectedIndex.get(), 0, this.assembly.numStages()))
    this.selectedIndex.subscribe(this.trackerSubscription, funcOn(this.onSelectedIndexChanged))

    tracker.onMount(() => this.setup())

    const stages = this.assembly.getAllStages()
    return (
      <props.uses
        {...props}
        onCreate={(e) => (this.element = e)}
        items={stages.map((l) => l.name.get())}
        selected_index={this.selectedIndex}
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
      stage.name.subscribe(subscription, bind(funcOn(this.setDropDownItem), stage.stageNumber))
    }
    playerCurrentStage(this.playerIndex).subscribeAndFire(subscription, funcOn(this.playerStageChanged))

    this.assembly.localEvents.subscribe(subscription, funcOn(this.onAssemblyEvent))
  }

  private onAssemblyEvent(_: Subscription, event: LocalAssemblyEvent) {
    if (event.type === "stage-added" || event.type === "stage-deleted") {
      this.setup()
    } else if (event.type !== "assembly-deleted" && event.type !== "pre-stage-deleted") {
      assertNever(event)
    }
  }

  private setDropDownItem(stageNumber: StageNumber, _: Subscription, name: LocalisedString) {
    this.element.set_item(stageNumber, name)
  }

  private onSelectedIndexChanged(_: Subscription, index: number) {
    if (!this.assembly.valid) return
    const stage = this.assembly.getStage(index)
    if (!stage) return
    teleportToStage(game.get_player(this.playerIndex)!, stage)
  }

  private playerStageChanged(_: any, stage: Stage | nil) {
    if (stage && stage.assembly === this.assembly && stage.stageNumber <= this.element.items.length) {
      this.selectedIndex.set(stage.stageNumber)
      this.selectedIndex.forceNotify()
    }
  }
}

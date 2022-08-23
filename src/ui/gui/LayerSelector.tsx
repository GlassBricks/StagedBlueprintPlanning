/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with BBPP3. If not, see <https://www.gnu.org/licenses/>.
 */

import { clamp } from "util"
import { Assembly, Layer, LocalAssemblyEvent } from "../../assembly/AssemblyDef"
import { LayerNumber } from "../../entity/AssemblyEntity"
import { assertNever, bind, funcOn, RegisterClass } from "../../lib"
import { Component, ElemProps, FactorioJsx, Spec, Tracker } from "../../lib/factoriojsx"
import { MutableState, state, Subscription } from "../../lib/observable"
import { playerCurrentLayer, teleportToLayer } from "../player-position"

export type LayerSelectorProps<T extends "drop-down" | "list-box"> = {
  uses: T
  assembly: Assembly
  selectedIndex?: MutableState<LayerNumber>
} & ElemProps<T>
@RegisterClass("gui:CurrentLayer")
export class LayerSelector<T extends "drop-down" | "list-box"> extends Component<LayerSelectorProps<T>> {
  private assembly!: Assembly
  private trackerSubscription!: Subscription
  private playerIndex!: PlayerIndex

  private elementsSubscription!: Subscription
  private element!: DropDownGuiElement | ListBoxGuiElement
  private selectedIndex!: MutableState<number>

  public override render(props: LayerSelectorProps<T>, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.selectedIndex = props.selectedIndex ?? state(0)

    this.trackerSubscription = tracker.getSubscription()
    this.playerIndex = tracker.playerIndex

    this.selectedIndex.set(clamp(this.selectedIndex.get(), 1, this.assembly.numLayers()))
    this.selectedIndex.subscribe(this.trackerSubscription, funcOn(this.onSelectedIndexChanged))

    tracker.onMount(() => this.setup())

    const layers = this.assembly.getAllLayers()
    return (
      <props.uses
        {...props}
        onCreate={(e) => (this.element = e)}
        items={layers.map((l) => l.name.get())}
        selected_index={this.selectedIndex}
      />
    )
  }

  private setup() {
    this.elementsSubscription?.close()
    const subscription = (this.elementsSubscription = new Subscription())
    this.trackerSubscription.add(subscription)

    const layers = this.assembly.getAllLayers()
    for (const layer of layers) {
      layer.name.subscribe(subscription, bind(funcOn(this.setDropDownItem), layer.layerNumber))
    }
    playerCurrentLayer(this.playerIndex).subscribeAndFire(subscription, funcOn(this.playerLayerChanged))

    this.assembly.localEvents.subscribe(subscription, funcOn(this.onAssemblyEvent))
  }

  private onAssemblyEvent(_: Subscription, event: LocalAssemblyEvent) {
    if (event.type === "layer-added") {
      this.element.add_item(event.layer.name.get(), event.layer.layerNumber)
    } else if (event.type === "layer-deleted") {
      this.element.remove_item(event.layer.layerNumber)
    } else if (event.type !== "assembly-deleted" && event.type !== "pre-layer-deleted") {
      assertNever(event)
    }
  }

  private setDropDownItem(layerNumber: LayerNumber, _: Subscription, name: LocalisedString) {
    this.element.set_item(layerNumber, name)
  }

  private onSelectedIndexChanged(_: Subscription, index: number) {
    if (!this.assembly.valid) return
    const layer = this.assembly.getLayer(index)
    if (!layer) return
    teleportToLayer(game.get_player(this.playerIndex)!, layer)
  }

  private playerLayerChanged(_: any, layer: Layer | nil) {
    if (layer && layer.assembly === this.assembly) {
      this.selectedIndex.set(layer.layerNumber)
      this.selectedIndex.forceNotify()
    }
  }
}

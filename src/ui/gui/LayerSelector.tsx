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

import { Assembly, Layer } from "../../assembly/Assembly"
import { LayerNumber } from "../../entity/AssemblyEntity"
import { bind, funcOn, RegisterClass } from "../../lib"
import { Component, FactorioJsx, Spec, Tracker } from "../../lib/factoriojsx"
import { state, Subscription } from "../../lib/observable"
import { playerCurrentLayer, teleportToLayer } from "../player-position"

@RegisterClass("gui:CurrentLayer")
export class LayerSelector extends Component<{ assembly: Assembly }> {
  private assembly!: Assembly
  private trackerSubscription!: Subscription
  private playerIndex!: PlayerIndex

  private elementsSubscription!: Subscription
  private dropDown!: DropDownGuiElement
  private selectedIndex = state(0)

  public override render(props: { assembly: Assembly }, tracker: Tracker): Spec {
    this.assembly = props.assembly
    this.trackerSubscription = tracker.getSubscription()
    this.playerIndex = tracker.playerIndex

    tracker.onMount(() => this.setupDropDown())
    this.selectedIndex.subscribe(this.trackerSubscription, funcOn(this.onSelectedIndexChanged))

    return (
      <drop-down
        styleMod={{
          minimal_width: 200,
        }}
        onCreate={(e) => (this.dropDown = e)}
        selected_index={this.selectedIndex}
      />
    )
  }

  private setupDropDown() {
    this.elementsSubscription?.close()
    const subscription = (this.elementsSubscription = new Subscription())
    this.trackerSubscription.add(subscription)

    const layers = this.assembly.getAllLayers()
    this.dropDown.items = layers.map((l) => l.displayName.get())
    for (const layer of layers) {
      layer.displayName.subscribe(subscription, bind(funcOn(this.setDropDownItem), layer.layerNumber))
    }
    playerCurrentLayer(this.playerIndex).subscribeAndFire(this.elementsSubscription, funcOn(this.playerLayerChanged))

    // todo: listen for layer changes
  }

  private setDropDownItem(layerNumber: LayerNumber, _: Subscription, name: LocalisedString) {
    this.dropDown.set_item(layerNumber, name)
  }

  private onSelectedIndexChanged(_: Subscription, index: number) {
    if (!this.assembly.valid || index <= 0 || index > this.assembly.numLayers()) return
    const layer = this.assembly.getLayer(index)
    const player = game.get_player(this.playerIndex)!
    teleportToLayer(player, layer)
  }

  private playerLayerChanged(_: any, layer: Layer | nil) {
    if (layer && layer.assembly === this.assembly) {
      this.selectedIndex.set(layer.layerNumber)
    }
  }
}

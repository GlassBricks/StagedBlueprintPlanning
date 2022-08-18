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

import { LayerNumber } from "../entity/AssemblyEntity"
import { bind, Events, Mutable, RegisterClass, registerFunctions } from "../lib"
import { Pos, Vec2 } from "../lib/geometry"
import { Event, state, State } from "../lib/observable"
import { L_Assembly } from "../locale"
import { WorldPosition } from "../utils/world-location"
import { Assembly, AssemblyChangeEvent, AssemblyId, Layer } from "./Assembly"
import { setupAssemblyDisplay } from "./AssemblyDisplay"
import { newEntityMap } from "./EntityMap"
import { registerAssembly } from "./world-register"

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: LuaMap<AssemblyId, AssemblyImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = new LuaMap()
})

type AssemblyLayer = Mutable<Layer>

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>

  private layers: AssemblyLayer[] = []

  content = newEntityMap()

  events: Event<AssemblyChangeEvent> = new Event()

  valid = true

  private constructor(readonly id: AssemblyId, readonly chunkSize: Vec2) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedAssembly, id))
  }

  static create(chunkSize: Vec2): AssemblyImpl {
    const id = global.nextAssemblyId++ as AssemblyId
    assert(chunkSize.x > 0 && chunkSize.y > 0, "size must be positive")
    const actualSize = Pos.ceil(chunkSize)

    const assembly = new AssemblyImpl(id, actualSize)
    global.assemblies.set(id, assembly)

    registerAssembly(assembly)
    setupAssemblyDisplay(assembly)

    return assembly
  }
  static _mock(chunkSize: Vec2): AssemblyImpl {
    // does not hook to anything.
    return new AssemblyImpl(0 as AssemblyId, chunkSize)
  }

  getLayer(layerNumber: LayerNumber): Layer {
    const layer = this.layers[layerNumber - 1]
    assert(layer, "layer not found")
    return layer
  }
  numLayers(): number {
    return this.layers.length
  }

  iterateLayers(start?: LayerNumber, end?: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, Layer]>>
  iterateLayers(start: LayerNumber = 1, end: LayerNumber = this.layers.length): any {
    function next(layers: Layer[], i: number) {
      if (i >= end) return
      i++
      return $multi(i, layers[i - 1])
    }
    return $multi(next, this.layers, start - 1)
  }

  delete() {
    if (!this.valid) return
    global.assemblies.delete(this.id)
    this.valid = false
    for (const layer of this.layers) {
      layer.valid = false
    }
    this.events.raise({ type: "assembly-deleted", assembly: this })
    this.events.closeAll()
  }

  pushLayer(leftTop: WorldPosition): Layer {
    const nextIndex = this.layers.length + 1
    const layer = (this.layers[nextIndex - 1] = createLayer(this, nextIndex, leftTop))
    this.events.raise({ type: "layer-pushed", layer, assembly: this })
    return layer
  }
}

export function newAssembly(chunkSize: Vec2): Assembly {
  return AssemblyImpl.create(chunkSize)
}
export function _mockAssembly(chunkSize: Vec2): Assembly {
  return AssemblyImpl._mock(chunkSize)
}

export function _deleteAllAssemblies(): void {
  for (const [, assembly] of global.assemblies) {
    assembly.delete()
  }
  global.nextAssemblyId = 1 as AssemblyId
}

function getDisplayName(locale: string, id: number, name: string): LocalisedString {
  return name !== "" ? name : [locale, id]
}
registerFunctions("AssemblyName", { getDisplayName })

function createLayer(parent: AssemblyImpl, layerNumber: LayerNumber, worldTopLeft: WorldPosition): Layer {
  const { chunkSize } = parent
  const { surface, position: leftTop } = worldTopLeft
  const actualLeftTop = Pos.floorToNearest(leftTop, 32)
  const rightBottom = Pos.plus(actualLeftTop, Pos.times(chunkSize, 32))
  const name = state("")
  return {
    layerNumber,
    surface,
    left_top: actualLeftTop,
    right_bottom: rightBottom,
    name,
    displayName: name.map(bind(getDisplayName, L_Assembly.UnnamedLayer, layerNumber)),
    assembly: parent,
    valid: true,
  }
}

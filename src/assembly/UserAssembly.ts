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
import { bind, Events, RegisterClass, registerFunctions } from "../lib"
import { BBox, Pos, Position } from "../lib/geometry"
import { Event, State, state } from "../lib/observable"
import { globalEvent } from "../lib/observable/GlobalEvent"
import { L_Assembly } from "../locale"
import { WorldArea } from "../utils/world-location"
import { Assembly, AssemblyChangeEvent, AssemblyId, GlobalAssemblyEvent, Layer } from "./Assembly"
import { setupAssemblyDisplay } from "./AssemblyDisplay"
import { newEntityMap } from "./EntityMap"
import { getLayerNumberOfSurface } from "./surfaces"
import { registerAssemblyLocation } from "./world-register"
import floor = math.floor

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: LuaMap<AssemblyId, AssemblyImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = new LuaMap()
})

export const AssemblyEvents = globalEvent<GlobalAssemblyEvent>()

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>

  private readonly layers: LayerImpl[]
  content = newEntityMap()

  events: Event<AssemblyChangeEvent> = new Event()

  valid = true

  protected constructor(readonly id: AssemblyId, readonly bbox: BBox, initialLayerPositions: readonly WorldArea[]) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedAssembly, id))
    this.layers = initialLayerPositions.map((area, i) => new LayerImpl(this, i + 1, area.surface, area.bbox))
  }

  static create(bbox: BBox, surfaces: readonly LuaSurface[]): AssemblyImpl {
    const assembly = new AssemblyImpl(
      global.nextAssemblyId++ as AssemblyId,
      bbox,
      surfaces.map((surface) => ({ surface, bbox })),
    )
    AssemblyImpl.onAssemblyCreated(assembly)

    return assembly
  }

  static onAssemblyCreated(assembly: AssemblyImpl): void {
    global.assemblies.set(assembly.id, assembly)

    // todo: move to event?
    registerAssemblyLocation(assembly)
    setupAssemblyDisplay(assembly)
    AssemblyEvents.raise({ type: "assembly-created", assembly })
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

  public getAllLayers(): readonly Layer[] {
    return this.layers
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLayerAt(surface: LuaSurface, _position: Position): Layer | nil {
    const layerIndex = getLayerNumberOfSurface(surface.index)
    if (layerIndex === nil) return nil
    return this.layers[layerIndex - 1]
  }

  public getLayerName(layerNumber: LayerNumber): LocalisedString {
    return this.getLayer(layerNumber).displayName.get()
  }

  delete() {
    if (!this.valid) return
    global.assemblies.delete(this.id)
    this.valid = false
    for (const layer of this.layers) {
      layer.valid = false
    }
    // todo: move this to global event?
    this.events.raise({ type: "assembly-deleted", assembly: this })
    this.events.closeAll()

    AssemblyEvents.raise({ type: "assembly-deleted", assembly: this })
  }
}

/**
 * Does not perform any checks.
 */
export function newAssembly(surfaces: readonly LuaSurface[], bbox: BoundingBox): Assembly {
  bbox = BBox.scale(bbox, 1 / 32)
    .roundTile()
    .scale(32)
  return AssemblyImpl.create(bbox, surfaces)
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
registerFunctions("Assembly", { getDisplayName })

@RegisterClass("Layer")
class LayerImpl implements Layer {
  left_top: Position
  right_bottom: Position

  name = state("")
  displayName: State<LocalisedString>

  valid = true

  constructor(
    public readonly assembly: AssemblyImpl,
    public layerNumber: LayerNumber,
    public readonly surface: LuaSurface,
    bbox: BoundingBox,
  ) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedLayer, this.layerNumber))
    this.left_top = bbox.left_top
    this.right_bottom = bbox.right_bottom
  }
}

@RegisterClass("DemonstrationAssembly")
class DemonstrationAssembly extends AssemblyImpl {
  constructor(numLayers: LayerNumber) {
    super(
      0 as AssemblyId,
      BBox.coords(0, 0, 32 * numLayers, 32),
      Array.from({ length: numLayers }, (_, i) => ({
        surface: game.surfaces[1],
        bbox: BBox.coords(0, 0, 32, 32).translate(Pos(i * 32, 0)),
      })),
    )
  }
  override getLayerAt(surface: LuaSurface, position: Position): Layer | nil {
    const index = floor(position.x / 32)
    if (index < 0 || index >= this.numLayers()) return nil
    return this.getLayer(index + 1)
  }
}
export function _mockAssembly(numLayers: number = 0): Assembly {
  return new DemonstrationAssembly(numLayers)
}
export function createDemonstrationAssembly(numLayers: number): Assembly {
  const assembly = new DemonstrationAssembly(numLayers)
  AssemblyImpl.onAssemblyCreated(assembly)
  return assembly
}

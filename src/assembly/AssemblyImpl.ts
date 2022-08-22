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
import { Event, MutableState, State, state } from "../lib/observable"
import { globalEvent } from "../lib/observable/GlobalEvent"
import { L_Assembly } from "../locale"
import { WorldArea } from "../utils/world-location"
import { Assembly, AssemblyId, GlobalAssemblyEvent, Layer, LocalAssemblyEvent } from "./Assembly"
import { newEntityMap } from "./EntityMap"
import { getLayerNumberOfSurface } from "./surfaces"
import floor = math.floor

declare const global: {
  nextAssemblyId: AssemblyId
  assemblies: LuaMap<AssemblyId, AssemblyImpl>
}
Events.on_init(() => {
  global.nextAssemblyId = 1 as AssemblyId
  global.assemblies = new LuaMap()
})

const GlobalAssemblyEvents = globalEvent<GlobalAssemblyEvent>()
export { GlobalAssemblyEvents as AssemblyEvents }

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>

  private readonly layers: LayerImpl[]
  content = newEntityMap()

  localEvents = new Event<LocalAssemblyEvent>()

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
  public pushLayer(surface: LuaSurface, bbox: BoundingBox): Layer {
    this.assertValid()
    const layerNumber = this.layers.length + 1
    const layer = new LayerImpl(this, layerNumber, surface, bbox)
    this.layers.push(layer)

    if (this.id !== 0) this.raiseEvent({ type: "layer-pushed", assembly: this, layer })
    return layer
  }

  getLayer(layerNumber: LayerNumber): Layer | nil {
    return this.layers[layerNumber - 1]
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
  getLayerName(layerNumber: LayerNumber): LocalisedString {
    return this.layers[layerNumber - 1].name.get()
  }
  delete() {
    if (!this.valid) return
    global.assemblies.delete(this.id)
    this.valid = false
    for (const layer of this.layers) {
      layer.valid = false
    }
    this.raiseEvent({ type: "assembly-deleted", assembly: this })
    this.localEvents.closeAll()
  }
  static onAssemblyCreated(assembly: AssemblyImpl): void {
    global.assemblies.set(assembly.id, assembly)
    GlobalAssemblyEvents.raise({ type: "assembly-created", assembly })
  }
  private raiseEvent(event: LocalAssemblyEvent): void {
    // global first, more useful event order
    GlobalAssemblyEvents.raise(event)
    this.localEvents.raise(event)
  }
  private assertValid(): void {
    if (!this.valid) error("Assembly is invalid")
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

  name: MutableState<string>

  valid = true

  constructor(
    public readonly assembly: AssemblyImpl,
    public layerNumber: LayerNumber,
    public readonly surface: LuaSurface,
    bbox: BoundingBox,
  ) {
    this.left_top = bbox.left_top
    this.right_bottom = bbox.right_bottom
    this.name = state(`<Layer ${layerNumber}>`)
  }
}

@RegisterClass("DemonstrationAssembly")
class DemonstrationAssembly extends AssemblyImpl {
  constructor(id: AssemblyId, private initialNumLayers: LayerNumber) {
    super(
      id,
      BBox.coords(0, 0, 32 * initialNumLayers, 32),
      Array.from({ length: initialNumLayers }, (_, i) => ({
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
  public override pushLayer(): Layer {
    error("Cannot push layers to a demonstration assembly")
  }
}
export function _mockAssembly(numLayers: number = 0): Assembly {
  return new DemonstrationAssembly(0 as AssemblyId, numLayers)
}
export function createDemonstrationAssembly(numLayers: number): Assembly {
  const id = global.nextAssemblyId++ as AssemblyId
  const assembly = new DemonstrationAssembly(id, numLayers)
  AssemblyImpl.onAssemblyCreated(assembly)
  return assembly
}

/**
 * @deprecated
 */
export function onAssemblyDeleted(cb: (assembly: Assembly) => void): void {
  GlobalAssemblyEvents.addListener((e) => {
    if (e.type === "assembly-deleted") cb(e.assembly)
  })
}

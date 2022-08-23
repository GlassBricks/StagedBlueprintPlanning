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
import { Assembly, AssemblyId, GlobalAssemblyEvent, Layer, LocalAssemblyEvent } from "./AssemblyDef"
import { newEntityMap } from "./EntityMap"
import { generateAssemblySurfaces, getAssemblySurface, getOrGenerateAssemblySurface, prepareArea } from "./surfaces"
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

declare const luaLength: LuaLength<Record<number, any>, number>

@RegisterClass("Assembly")
class AssemblyImpl implements Assembly {
  name = state("")
  displayName: State<LocalisedString>

  content = newEntityMap()
  localEvents = new Event<LocalAssemblyEvent>()

  valid = true

  private readonly layers: Record<number, LayerImpl>
  private readonly surfaceIndexToLayerNumber = new LuaMap<SurfaceIndex, LayerNumber>()

  protected constructor(readonly id: AssemblyId, readonly bbox: BBox, initialLayerPositions: readonly WorldArea[]) {
    this.displayName = this.name.map(bind(getDisplayName, L_Assembly.UnnamedAssembly, id))
    this.layers = initialLayerPositions.map(
      (area, i) => new LayerImpl(this, i + 1, area.surface, area.bbox, `<Layer ${i + 1}>`),
    )
    for (const [number, layer] of pairs(this.layers)) {
      this.surfaceIndexToLayerNumber.set(layer.surface.index, number)
    }
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

  getLayer(layerNumber: LayerNumber): Layer | nil {
    return this.layers[layerNumber]
  }

  iterateLayers(start?: LayerNumber, end?: LayerNumber): LuaIterable<LuaMultiReturn<[LayerNumber, Layer]>>
  iterateLayers(start: LayerNumber = 1, end: LayerNumber = this.numLayers()): any {
    function next(layers: Layer[], i: number) {
      if (i >= end) return
      i++
      return $multi(i, layers[i - 1])
    }
    return $multi(next, this.layers, start - 1)
  }

  getAllLayers(): readonly Layer[] {
    return this.layers as unknown as readonly Layer[]
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLayerAt(surface: LuaSurface, _position: Position): Layer | nil {
    const layerIndex = this.surfaceIndexToLayerNumber.get(surface.index)
    if (layerIndex === nil) return nil
    return this.layers[layerIndex]
  }

  insertLayer(index: LayerNumber): Layer {
    this.assertValid()
    assert(index >= 1 && index <= this.numLayers() + 1, "Invalid new layer number")

    const surface = this.findNewLayerSurface()

    const newLayer = new LayerImpl(this, index, surface, this.bbox, this.createNewLayerName())
    table.insert(this.layers as unknown as Layer[], index, newLayer)
    // update layers
    for (const i of $range(index, luaLength(this.layers))) {
      const layer = this.layers[i]
      layer.layerNumber = i
      this.surfaceIndexToLayerNumber.set(layer.surface.index, i)
    }

    this.content.insertLayer(index)

    this.raiseEvent({ type: "layer-added", assembly: this, layer: newLayer })
    return newLayer
  }
  private findNewLayerSurface(): LuaSurface {
    for (let i = 1; ; i++) {
      const surface: LuaSurface = getOrGenerateAssemblySurface(i)
      if (!this.surfaceIndexToLayerNumber.has(surface.index)) {
        prepareArea(surface, this.bbox)
        return surface
      }
    }
  }
  public deleteLayer(index: LayerNumber): Layer {
    this.assertValid()
    assert(index > 1, "Cannot delete first layer")
    const layer = this.layers[index]
    assert(layer !== nil, "invalid layer number")

    this.raiseEvent({ type: "pre-layer-deleted", assembly: this, layer })

    layer.valid = false
    this.surfaceIndexToLayerNumber.delete(layer.surface.index)
    table.remove(this.layers as unknown as Layer[], index)
    // update layers
    for (const i of $range(index, this.numLayers())) {
      const layer = this.layers[i]
      layer.layerNumber = i
      this.surfaceIndexToLayerNumber.set(layer.surface.index, i)
    }

    this.content.deleteLayer(index)

    this.raiseEvent({ type: "layer-deleted", assembly: this, layer })
    return layer
  }

  delete() {
    if (!this.valid) return
    global.assemblies.delete(this.id)
    this.valid = false
    for (const [, layer] of pairs(this.layers)) {
      layer.valid = false
    }
    this.raiseEvent({ type: "assembly-deleted", assembly: this })
    this.localEvents.closeAll()
  }
  numLayers(): number {
    return luaLength(this.layers)
  }
  getLayerName(layerNumber: LayerNumber): LocalisedString {
    return this.layers[layerNumber].name.get()
  }
  private createNewLayerName(): string {
    let subName = ""
    for (let i = 1; ; i++) {
      const name = `<New layer>${subName}`
      if ((this.layers as unknown as Layer[]).some((layer) => layer.name.get() === name)) {
        subName = ` (${i})`
      } else {
        return name
      }
    }
  }
  static onAssemblyCreated(assembly: AssemblyImpl): void {
    global.assemblies.set(assembly.id, assembly)
    GlobalAssemblyEvents.raise({ type: "assembly-created", assembly })
  }
  private raiseEvent(event: LocalAssemblyEvent): void {
    // local first, more useful event order
    this.localEvents.raise(event)
    GlobalAssemblyEvents.raise(event)
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

export function userCreateAssembly(
  area: BoundingBox,
  numLayers: number,
  deleteExistingEntities: boolean,
  name: string,
): Assembly {
  const surfaces = prepareAssemblySurfaces(area, numLayers)
  if (deleteExistingEntities) {
    for (const surface of surfaces) for (const e of surface.find_entities(area)) e.destroy()
  }
  const assembly = newAssembly(surfaces, area)
  assembly.name.set(name)
  return assembly
}

function prepareAssemblySurfaces(area: BBox, numLayers: number): LuaSurface[] {
  generateAssemblySurfaces(numLayers)
  const surfaces: LuaSurface[] = []
  for (const i of $range(1, numLayers)) {
    const surface = getAssemblySurface(i)!
    prepareArea(surface, area)
    surfaces.push(surface)
  }
  return surfaces
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
    name: string,
  ) {
    this.left_top = bbox.left_top
    this.right_bottom = bbox.right_bottom
    this.name = state(name)
  }

  public deleteInAssembly(): void {
    if (!this.valid) return
    this.assembly.deleteLayer(this.layerNumber)
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
  override insertLayer(): Layer {
    error("Cannot add layers to a demonstration assembly")
  }
  override deleteLayer(): Layer {
    error("Cannot delete layers from a demonstration assembly")
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

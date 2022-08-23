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

import {
  Assembly,
  AssemblyCreatedEvent,
  AssemblyDeletedEvent,
  LayerAddedEvent,
  LayerDeletedEvent,
  PreLayerDeletedEvent,
} from "../../assembly/Assembly"
import { _deleteAllAssemblies, _mockAssembly, AssemblyEvents, newAssembly } from "../../assembly/AssemblyImpl"
import { getOrGenerateAssemblySurface } from "../../assembly/surfaces"
import { SelflessFun } from "../../lib"
import { BBox, BBoxClass, Pos } from "../../lib/geometry"

let eventListener: SelflessFun & spy.SpyObj<SelflessFun>
before_each(() => {
  eventListener = spy()
  AssemblyEvents.addListener(eventListener)
})
after_each(() => {
  AssemblyEvents.removeListener(eventListener)
  _deleteAllAssemblies()
})

const bbox: BBoxClass = BBox.coords(0, 0, 32, 32)

test("basic", () => {
  const asm1 = newAssembly([], bbox)
  assert.true(asm1.valid)

  const asm2 = newAssembly([], bbox)
  assert.not_same(asm1.id, asm2.id)
})

test("assembly created calls event", () => {
  const asm = newAssembly([], bbox)
  assert.spy(eventListener).called_with({
    type: "assembly-created",
    assembly: asm,
  } as AssemblyCreatedEvent)
})

test("get layer at", () => {
  const surfaces = [getOrGenerateAssemblySurface(1), getOrGenerateAssemblySurface(2)]
  const asm = newAssembly(surfaces, bbox)
  assert.same(asm.getLayerAt(surfaces[0], bbox.center()), asm.getLayer(1))
  assert.same(asm.getLayerAt(surfaces[1], bbox.center()), asm.getLayer(2))
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const asm = _mockAssembly()
    asm.delete()
    assert.false(asm.valid)
  })
  test("sets layers to invalid", () => {
    const asm = _mockAssembly(1)
    const layer = asm.getLayer(1)!
    assert.true(layer.valid)
    asm.delete()
    assert.false(layer.valid)
  })
  test("calls event", () => {
    const asm = newAssembly([], bbox)
    const sp2 = spy()
    asm.localEvents.subscribeIndependently({ invoke: sp2 })
    asm.delete()
    let call = eventListener.calls[1].refs[0] as AssemblyDeletedEvent
    assert.same("assembly-deleted", call.type)
    assert.same(asm, call.assembly)
    call = sp2.calls[0].refs[2] as AssemblyDeletedEvent
    assert.same("assembly-deleted", call.type)
    assert.same(asm, call.assembly)
  })
})

describe("Layers", () => {
  let asm: Assembly
  before_each(() => {
    asm = _mockAssembly(2)
  })
  test("layerNumber is correct", () => {
    assert.equals(1, asm.getLayer(1)!.layerNumber)
    assert.equals(2, asm.getLayer(2)!.layerNumber)
  })
  test("initial name is correct", () => {
    const layer = asm.getLayer(1)!
    assert.same("<Layer 1>", layer.name.get())
  })
})

test("insert layer", () => {
  const sp = spy()
  const asm = newAssembly([game.surfaces[1]], bbox)
  const oldLayer = asm.getLayer(1)!
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const layer = asm.insertLayer(1)

  assert.not_equal(layer.surface.index, oldLayer.surface.index)

  assert.equals(1, layer.layerNumber)
  assert.equals(2, oldLayer.layerNumber)

  assert.equal(asm.getLayerAt(layer.surface, Pos(1, 1)), layer)
  assert.equal(asm.getLayerAt(oldLayer.surface, Pos(1, 1)), oldLayer)

  assert.equals("<New layer>", layer.name.get())

  assert.equals(layer, asm.getLayer(1)!)
  assert.equals(oldLayer, asm.getLayer(2)!)

  let call = eventListener.calls[0].refs[0] as LayerAddedEvent
  assert.equals("layer-added", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(layer, call.layer)
  call = sp.calls[0].refs[2] as LayerAddedEvent
  assert.equals("layer-added", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(layer, call.layer)

  const anotherInserted = asm.insertLayer(1)
  assert.not_same(anotherInserted, layer)
  assert.equals(asm.getLayerAt(anotherInserted.surface, Pos(1, 1)), anotherInserted)
  assert.equals(asm.getLayerAt(layer.surface, Pos(1, 1)), layer)
  assert.equals(asm.getLayerAt(oldLayer.surface, Pos(1, 1)), oldLayer)
  assert.equals("<New layer> (1)", anotherInserted.name.get())

  assert.equals(1, anotherInserted.layerNumber)
  assert.equals(2, layer.layerNumber)
  assert.equals(3, oldLayer.layerNumber)

  assert.equals(anotherInserted, asm.getLayer(1)!)
  assert.equals(layer, asm.getLayer(2)!)
  assert.equals(oldLayer, asm.getLayer(3)!)
})

test("delete layer", () => {
  const sp = spy()
  const surfaces = [getOrGenerateAssemblySurface(1), getOrGenerateAssemblySurface(2), getOrGenerateAssemblySurface(3)]
  const asm = newAssembly(surfaces, bbox)
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const layer1 = asm.getLayer(1)!
  const layer2 = asm.getLayer(2)!
  const layer3 = asm.getLayer(3)!

  asm.deleteLayer(2)

  assert.false(layer2.valid)

  assert.equals(1, layer1.layerNumber)
  assert.equals(2, layer3.layerNumber)

  assert.equals(asm.getLayerAt(layer1.surface, Pos(1, 1)), layer1)
  assert.equals(asm.getLayerAt(layer3.surface, Pos(1, 1)), layer3)
  assert.nil(asm.getLayerAt(layer2.surface, Pos(1, 1)))

  assert.equals(layer1, asm.getLayer(1)!)
  assert.equals(layer3, asm.getLayer(2)!)

  const call1 = eventListener.calls[0].refs[0] as PreLayerDeletedEvent
  assert.equals("pre-layer-deleted", call1.type)
  assert.equals(asm, call1.assembly)
  assert.equals(layer2, call1.layer)
  const call2 = eventListener.calls[1].refs[0] as LayerDeletedEvent
  assert.equals("layer-deleted", call2.type)
  assert.equals(asm, call2.assembly)
  assert.equals(layer2, call2.layer)
})

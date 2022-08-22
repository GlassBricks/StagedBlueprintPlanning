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

import { Assembly, AssemblyCreatedEvent, AssemblyDeletedEvent, LayerPushedEvent } from "../../assembly/Assembly"
import { _deleteAllAssemblies, _mockAssembly, AssemblyEvents, newAssembly } from "../../assembly/AssemblyImpl"
import { SelflessFun } from "../../lib"
import { BBox } from "../../lib/geometry"

let eventListener: SelflessFun & spy.SpyObj<SelflessFun>
before_each(() => {
  eventListener = spy()
  AssemblyEvents.addListener(eventListener)
})
after_each(() => {
  AssemblyEvents.removeListener(eventListener)
  _deleteAllAssemblies()
})

const bbox: BBox = BBox.coords(0, 0, 32, 32)

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

test("push layer", () => {
  const sp = spy()
  const asm = newAssembly([], bbox)
  asm.localEvents.subscribeIndependently({ invoke: sp })

  eventListener.clear()

  const layer = asm.pushLayer(game.surfaces[1], bbox)

  assert.equals(1, layer.layerNumber)
  assert.equals("<Layer 1>", layer.name.get())
  let call = eventListener.calls[0].refs[0] as LayerPushedEvent
  assert.equals("layer-pushed", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(layer, call.layer)
  call = sp.calls[0].refs[2] as LayerPushedEvent
  assert.equals("layer-pushed", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(layer, call.layer)
})

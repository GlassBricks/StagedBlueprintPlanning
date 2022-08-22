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

import { Assembly, AssemblyCreatedEvent } from "../../assembly/Assembly"
import { _deleteAllAssemblies, _mockAssembly, AssemblyEvents, newAssembly } from "../../assembly/AssemblyImpl"
import { SelflessFun } from "../../lib"
import { BBox } from "../../lib/geometry"

after_each(() => {
  _deleteAllAssemblies()
})

const bbox: BBox = BBox.coords(0, 0, 32, 32)

test("basic", () => {
  const asm1 = newAssembly([], bbox)
  assert.true(asm1.valid)

  const asm2 = newAssembly([], bbox)
  assert.not_same(asm1.id, asm2.id)
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
})

describe("events", () => {
  let sp: SelflessFun & spy.SpyObj<SelflessFun>
  before_each(() => {
    sp = spy()
    AssemblyEvents.addListener(sp)
  })
  after_each(() => {
    AssemblyEvents.removeListener(sp)
  })
  test("assembly created", () => {
    const asm = newAssembly([], bbox)
    assert.spy(sp).called_with({
      type: "assembly-created",
      assembly: asm,
    } as AssemblyCreatedEvent)
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

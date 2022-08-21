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

import { Assembly } from "../../assembly/Assembly"
import { _deleteAllAssemblies, _mockAssembly, newAssembly } from "../../assembly/UserAssembly"
import { BBox } from "../../lib/geometry"
import { L_Assembly } from "../../locale"

after_each(() => {
  _deleteAllAssemblies()
})

const bbox: BBox = BBox.coords(0, 0, 32, 32)

describe("Assembly", () => {
  test("basic", () => {
    const asm1 = newAssembly([], bbox)
    assert.true(asm1.valid)

    const asm2 = newAssembly([], bbox)
    assert.not_same(asm1.id, asm2.id)
  })

  test("Display name is correct", () => {
    const asm = _mockAssembly()
    assert.same([L_Assembly.UnnamedAssembly, asm.id], asm.displayName.get())
    asm.name.set("test")
    assert.same("test", asm.displayName.get())
  })

  describe("deletion", () => {
    test("sets to invalid", () => {
      const asm = _mockAssembly()
      asm.delete()
      assert.false(asm.valid)
    })
    test("sets layers to invalid", () => {
      const asm = _mockAssembly(1)
      const layer = asm.getLayer(1)
      assert.true(layer.valid)
      asm.delete()
      assert.false(layer.valid)
    })
    test("fires event", () => {
      const asm = _mockAssembly()
      const sp = spy()
      asm.events.subscribeIndependently({ invoke: sp })
      asm.delete()
      assert.same(sp.calls[0].refs[2], {
        type: "assembly-deleted",
        assembly: asm,
      })
    })
  })
})

describe("Layers", () => {
  let asm: Assembly
  before_each(() => {
    asm = _mockAssembly(2)
  })
  test("layerNumber is correct", () => {
    assert.equals(1, asm.getLayer(1).layerNumber)
    assert.equals(2, asm.getLayer(2).layerNumber)
  })

  test("display name is correct", () => {
    const layer = asm.getLayer(1)
    assert.same([L_Assembly.UnnamedLayer, layer.layerNumber], layer.displayName.get())
    layer.name.set("test")
    assert.same("test", layer.displayName.get())
  })
})

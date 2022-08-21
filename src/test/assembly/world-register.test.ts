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
import { _mockAssembly } from "../../assembly/UserAssembly"
import {
  findIntersectingAssembly,
  getAssemblyAtPosition,
  registerAssemblyLocation,
  unregisterAssemblyLocation,
} from "../../assembly/world-register"
import { BBox, Pos } from "../../lib/geometry"

let assembly: Assembly
before_all(() => {
  assembly = _mockAssembly(5)
})

test("registers in world correctly", () => {
  registerAssemblyLocation(assembly)
  after_test(() => unregisterAssemblyLocation(assembly))
  const center = BBox.center(assembly.bbox)
  assert.equal(assembly, getAssemblyAtPosition(center))
  assert.not_equal(assembly, getAssemblyAtPosition(center.plus(Pos(33, 33))))

  assert.equal(assembly, findIntersectingAssembly(assembly.bbox))

  assembly.delete()
  for (const [, layer] of assembly.iterateLayers()) {
    const center = BBox.center(layer)
    assert.nil(getAssemblyAtPosition(center))
  }
})

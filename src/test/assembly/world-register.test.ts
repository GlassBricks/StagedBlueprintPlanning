/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { _mockAssembly } from "../../assembly/Assembly"
import { Assembly } from "../../assembly/AssemblyDef"
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
  for (const [, stage] of assembly.iterateStages()) {
    const center = BBox.center(stage)
    assert.nil(getAssemblyAtPosition(center))
  }
})

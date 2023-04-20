/*
 * Copyright (c) 2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import { createAssemblyEntity } from "../../entity/AssemblyEntity"
import {
  emptyBeltControlBehavior,
  emptyInserterControlBehavior,
  trySetEmptyControlBehavior,
} from "../../entity/empty-control-behavior"

test("returns false if <= first stage", () => {
  const asmEntity = createAssemblyEntity(
    {
      name: "inserter",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(trySetEmptyControlBehavior(asmEntity, 1)).toBe(false)
  expect(trySetEmptyControlBehavior(asmEntity, 0)).toBe(false)
  expect(asmEntity.firstValue.control_behavior).toBe(nil)
})

test("returns false if control_behavior is already set", () => {
  const asmEntity = createAssemblyEntity(
    {
      name: "inserter",
      control_behavior: { circuit_mode_of_operation: 0 },
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(trySetEmptyControlBehavior(asmEntity, 2)).toBe(false)
  expect(asmEntity.firstValue.control_behavior).not.toBe(nil)
})

test("sets control behavior to empty for inserter", () => {
  const asmEntity = createAssemblyEntity(
    {
      name: "inserter",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(trySetEmptyControlBehavior(asmEntity, 2)).toBe(true)
  expect(asmEntity.firstValue.control_behavior).toEqual(emptyInserterControlBehavior)
})

test("sets control behavior to empty for belt", () => {
  const asmEntity = createAssemblyEntity(
    {
      name: "transport-belt",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(trySetEmptyControlBehavior(asmEntity, 2)).toBe(true)
  expect(asmEntity.firstValue.control_behavior).toEqual(emptyBeltControlBehavior)
})

test("returns false for other entities", () => {
  const asmEntity = createAssemblyEntity(
    {
      name: "small-electric-pole",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(trySetEmptyControlBehavior(asmEntity, 2)).toBe(false)
  expect(asmEntity.firstValue.control_behavior).toBe(nil)
})

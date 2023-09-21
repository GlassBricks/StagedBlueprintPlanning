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
import {
  emptyBeltControlBehavior,
  emptyInserterControlBehavior,
  maybeSetEmptyControlBehavior,
} from "../../entity/empty-control-behavior"
import { createProjectEntityNoCopy } from "../../entity/ProjectEntity"

test("returns false if <= first stage", () => {
  const projectEntity = createProjectEntityNoCopy(
    {
      name: "inserter",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(maybeSetEmptyControlBehavior(projectEntity, 1)).toBe(false)
  expect(maybeSetEmptyControlBehavior(projectEntity, 0)).toBe(false)
  expect(projectEntity.firstValue.control_behavior).toBe(nil)
})

test("returns false if control_behavior is already set", () => {
  const projectEntity = createProjectEntityNoCopy(
    {
      name: "inserter",
      control_behavior: { circuit_mode_of_operation: 0 },
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(maybeSetEmptyControlBehavior(projectEntity, 2)).toBe(false)
  expect(projectEntity.firstValue.control_behavior).not.toBe(nil)
})

test("sets control behavior to empty for inserter", () => {
  const projectEntity = createProjectEntityNoCopy(
    {
      name: "inserter",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(maybeSetEmptyControlBehavior(projectEntity, 2)).toBe(true)
  expect(projectEntity.firstValue.control_behavior).toEqual(emptyInserterControlBehavior)
})

test("sets control behavior to empty for belt", () => {
  const projectEntity = createProjectEntityNoCopy(
    {
      name: "transport-belt",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(maybeSetEmptyControlBehavior(projectEntity, 2)).toBe(true)
  expect(projectEntity.firstValue.control_behavior).toEqual(emptyBeltControlBehavior)
})

test("returns false for other entities", () => {
  const projectEntity = createProjectEntityNoCopy(
    {
      name: "small-electric-pole",
      control_behavior: nil,
    },
    { x: 0.5, y: 0.5 },
    nil,
    1,
  )

  expect(maybeSetEmptyControlBehavior(projectEntity, 2)).toBe(false)
  expect(projectEntity.firstValue.control_behavior).toBe(nil)
})

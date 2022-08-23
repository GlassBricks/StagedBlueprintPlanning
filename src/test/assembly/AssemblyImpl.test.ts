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

import { _deleteAllAssemblies, _mockAssembly, AssemblyEvents, newAssembly } from "../../assembly/Assembly"
import {
  Assembly,
  AssemblyCreatedEvent,
  AssemblyDeletedEvent,
  PreStageDeletedEvent,
  StageAddedEvent,
  StageDeletedEvent,
} from "../../assembly/AssemblyDef"
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

test("get stage at", () => {
  const surfaces = [getOrGenerateAssemblySurface(1), getOrGenerateAssemblySurface(2)]
  const asm = newAssembly(surfaces, bbox)
  assert.same(asm.getStageAt(surfaces[0], bbox.center()), asm.getStage(1))
  assert.same(asm.getStageAt(surfaces[1], bbox.center()), asm.getStage(2))
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const asm = _mockAssembly()
    asm.delete()
    assert.false(asm.valid)
  })
  test("sets stages to invalid", () => {
    const asm = _mockAssembly(1)
    const stage = asm.getStage(1)!
    assert.true(stage.valid)
    asm.delete()
    assert.false(stage.valid)
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

describe("Stages", () => {
  let asm: Assembly
  before_each(() => {
    asm = _mockAssembly(2)
  })
  test("stageNumber is correct", () => {
    assert.equals(1, asm.getStage(1)!.stageNumber)
    assert.equals(2, asm.getStage(2)!.stageNumber)
  })
  test("initial name is correct", () => {
    const stage = asm.getStage(1)!
    assert.same("<Stage 1>", stage.name.get())
  })
})

test("insert stage", () => {
  const sp = spy()
  const asm = newAssembly([game.surfaces[1]], bbox)
  const oldStage = asm.getStage(1)!
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage = asm.insertStage(1)

  assert.not_equal(stage.surface.index, oldStage.surface.index)

  assert.equals(1, stage.stageNumber)
  assert.equals(2, oldStage.stageNumber)

  assert.equal(asm.getStageAt(stage.surface, Pos(1, 1)), stage)
  assert.equal(asm.getStageAt(oldStage.surface, Pos(1, 1)), oldStage)

  assert.equals("<New stage>", stage.name.get())

  assert.equals(stage, asm.getStage(1)!)
  assert.equals(oldStage, asm.getStage(2)!)

  let call = eventListener.calls[0].refs[0] as StageAddedEvent
  assert.equals("stage-added", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(stage, call.stage)
  call = sp.calls[0].refs[2] as StageAddedEvent
  assert.equals("stage-added", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(stage, call.stage)

  const anotherInserted = asm.insertStage(1)
  assert.not_same(anotherInserted, stage)
  assert.equals(asm.getStageAt(anotherInserted.surface, Pos(1, 1)), anotherInserted)
  assert.equals(asm.getStageAt(stage.surface, Pos(1, 1)), stage)
  assert.equals(asm.getStageAt(oldStage.surface, Pos(1, 1)), oldStage)
  assert.equals("<New stage> (1)", anotherInserted.name.get())

  assert.equals(1, anotherInserted.stageNumber)
  assert.equals(2, stage.stageNumber)
  assert.equals(3, oldStage.stageNumber)

  assert.equals(anotherInserted, asm.getStage(1)!)
  assert.equals(stage, asm.getStage(2)!)
  assert.equals(oldStage, asm.getStage(3)!)
})

test("delete stage", () => {
  const sp = spy()
  const surfaces = [getOrGenerateAssemblySurface(1), getOrGenerateAssemblySurface(2), getOrGenerateAssemblySurface(3)]
  const asm = newAssembly(surfaces, bbox)
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage1 = asm.getStage(1)!
  const stage2 = asm.getStage(2)!
  const stage3 = asm.getStage(3)!

  asm.deleteStage(2)

  assert.false(stage2.valid)

  assert.equals(1, stage1.stageNumber)
  assert.equals(2, stage3.stageNumber)

  assert.equals(asm.getStageAt(stage1.surface, Pos(1, 1)), stage1)
  assert.equals(asm.getStageAt(stage3.surface, Pos(1, 1)), stage3)
  assert.nil(asm.getStageAt(stage2.surface, Pos(1, 1)))

  assert.equals(stage1, asm.getStage(1)!)
  assert.equals(stage3, asm.getStage(2)!)

  const call1 = eventListener.calls[0].refs[0] as PreStageDeletedEvent
  assert.equals("pre-stage-deleted", call1.type)
  assert.equals(asm, call1.assembly)
  assert.equals(stage2, call1.stage)
  const call2 = eventListener.calls[1].refs[0] as StageDeletedEvent
  assert.equals("stage-deleted", call2.type)
  assert.equals(asm, call2.assembly)
  assert.equals(stage2, call2.stage)
})

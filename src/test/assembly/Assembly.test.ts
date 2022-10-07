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

import { _deleteAllAssemblies, AssemblyEvents, createAssembly, getStageAtSurface } from "../../assembly/Assembly"
import {
  Assembly,
  AssemblyCreatedEvent,
  AssemblyDeletedEvent,
  PreStageDeletedEvent,
  StageAddedEvent,
  StageDeletedEvent,
} from "../../assembly/AssemblyDef"
import { SelflessFun } from "../../lib"

let eventListener: spy.Spy<SelflessFun>
before_each(() => {
  eventListener = spy()
  AssemblyEvents.addListener(eventListener)
})
after_each(() => {
  AssemblyEvents.removeListener(eventListener)
  _deleteAllAssemblies()
})

test("assembly created calls event", () => {
  const asm = createAssembly("Mock", 0)
  assert.spy(eventListener).called_with({
    type: "assembly-created",
    assembly: asm,
  } as AssemblyCreatedEvent)
})

test("getStageAtSurface", () => {
  const asm = createAssembly("Mock", 2)
  const stage1 = asm.getStage(1),
    stage2 = asm.getStage(2)
  assert.equal(stage1, getStageAtSurface(stage1!.surface.index))
  assert.equal(stage2, getStageAtSurface(stage2!.surface.index))
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const asm = createAssembly("Test", 0)
    asm.delete()
    assert.false(asm.valid)
  })
  test("sets stages to invalid", () => {
    const asm = createAssembly("Test", 1)
    const stage = asm.getStage(1)!
    assert.true(stage.valid)
    asm.delete()
    assert.false(stage.valid)
  })
  test("calls event", () => {
    const asm = createAssembly("Mock", 0)
    const sp2 = spy()
    asm.localEvents.subscribeIndependently({ invoke: sp2 })
    asm.delete()
    let call = eventListener.calls[1].refs[0] as AssemblyDeletedEvent
    assert.same("assembly-deleted", call.type)
    assert.same(asm, call.assembly)
    call = sp2.calls[0].refs[1] as AssemblyDeletedEvent
    assert.same("assembly-deleted", call.type)
    assert.same(asm, call.assembly)
  })
})

describe("Stages", () => {
  let asm: Assembly
  before_each(() => {
    asm = createAssembly("Test", 2)
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
  const asm = createAssembly("Mock", 2)
  const oldStage = asm.getStage(1)!
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage = asm.insertStage(1)

  assert.not_equal(stage.surface.index, oldStage.surface.index)

  assert.equals(1, stage.stageNumber)
  assert.equals(2, oldStage.stageNumber)

  assert.equal(stage, getStageAtSurface(stage.surface.index))
  assert.equal(oldStage, getStageAtSurface(oldStage.surface.index))

  assert.equals("<New stage>", stage.name.get())

  assert.equals(stage, asm.getStage(1)!)
  assert.equals(oldStage, asm.getStage(2)!)

  let call = eventListener.calls[0].refs[0] as StageAddedEvent
  assert.equals("stage-added", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(stage, call.stage)
  call = sp.calls[0].refs[1] as StageAddedEvent
  assert.equals("stage-added", call.type)
  assert.equals(asm, call.assembly)
  assert.equals(stage, call.stage)

  const anotherInserted = asm.insertStage(1)
  assert.not_same(anotherInserted, stage)
  assert.equals(anotherInserted, getStageAtSurface(anotherInserted.surface.index))
  assert.equals(stage, getStageAtSurface(stage.surface.index))
  assert.equals(oldStage, getStageAtSurface(oldStage.surface.index))
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
  const asm = createAssembly("Test", 3)
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage1 = asm.getStage(1)!
  const stage2 = asm.getStage(2)!
  const stage3 = asm.getStage(3)!

  asm.deleteStage(2)

  const stage2Surface = stage2.surface.index
  assert.false(stage2.valid)

  assert.equals(1, stage1.stageNumber)
  assert.equals(2, stage3.stageNumber)

  assert.equal(stage1, getStageAtSurface(stage1.surface.index))
  assert.equal(stage3, getStageAtSurface(stage3.surface.index))
  assert.nil(getStageAtSurface(stage2Surface))

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

test("delete stage by deleting surface", () => {
  const asm = createAssembly("Test", 2)
  const stage = asm.getStage(2)!
  game.delete_surface(stage.surface)
  async()
  after_ticks(1, () => {
    assert.false(stage.valid)
    done()
  })
})

test("deleting last stage deletes assembly", () => {
  const asm = createAssembly("Test", 1)
  const stage = asm.getStage(1)!
  stage.deleteInAssembly()
  assert.false(asm.valid)
})

/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { AssemblyCreatedEvent, PreStageDeletedEvent, StageAddedEvent, UserAssembly } from "../../assembly/AssemblyDef"
import {
  _deleteAllAssemblies,
  AssemblyEvents,
  createUserAssembly,
  getStageAtSurface,
} from "../../assembly/UserAssembly"
import expect, { AnySelflessFun, mock, MockNoSelf } from "tstl-expect"

let eventListener: MockNoSelf<AnySelflessFun>
before_each(() => {
  eventListener = mock.fnNoSelf()
  AssemblyEvents.addListener(eventListener)
})
after_each(() => {
  AssemblyEvents.removeListener(eventListener)
  _deleteAllAssemblies()
})

test("assembly created calls event", () => {
  const asm = createUserAssembly("Mock", 0)
  expect(eventListener).calledWith({
    type: "assembly-created",
    assembly: asm,
  } as AssemblyCreatedEvent)
})

test("getStageAtSurface", () => {
  const asm = createUserAssembly("Mock", 2)
  const stage1 = asm.getStage(1)!,
    stage2 = asm.getStage(2)!
  expect(getStageAtSurface(stage1.surface.index)).to.be(stage1)
  expect(getStageAtSurface(stage2.surface.index)).to.be(stage2)
})

describe("deletion", () => {
  test("sets to invalid", () => {
    const asm = createUserAssembly("Test", 0)
    asm.delete()
    expect(asm.valid).to.be(false)
  })
  test("sets stages to invalid", () => {
    const asm = createUserAssembly("Test", 1)
    const stage = asm.getStage(1)!
    expect(stage.valid).to.be(true)
    asm.delete()
    expect(stage.valid).to.be(false)
  })
  test("calls event", () => {
    const asm = createUserAssembly("Mock", 0)
    const sp2 = mock.fn()
    asm.localEvents.subscribeIndependently({ invoke: sp2 })
    asm.delete()
    expect(eventListener).calledWith({
      type: "assembly-deleted",
      assembly: asm,
    })
    expect(sp2).calledWith({
      type: "assembly-deleted",
      assembly: asm,
    })
  })
})

describe("Stages", () => {
  let asm: UserAssembly
  before_each(() => {
    asm = createUserAssembly("Test", 2)
  })
  test("stageNumber is correct", () => {
    expect(asm.getStage(1)!.stageNumber).to.equal(1)
    expect(asm.getStage(2)!.stageNumber).to.equal(2)
  })
  test("initial name is correct", () => {
    const stage = asm.getStage(1)!
    expect(stage.name.get()).to.equal("<Stage 1>")
  })
})

test("insert stage", () => {
  const sp = mock.fn()
  const asm = createUserAssembly("Mock", 2)
  const oldStage = asm.getStage(1)!
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage = asm.insertStage(1)

  expect(oldStage.surface.index).not.to.equal(stage.surface.index)

  expect(stage.stageNumber).to.equal(1)
  expect(oldStage.stageNumber).to.equal(2)

  expect(getStageAtSurface(stage.surface.index)).to.be(stage)
  expect(getStageAtSurface(oldStage.surface.index)).to.be(oldStage)

  expect(stage.name.get()).to.equal("<New stage>")

  expect(asm.getStage(1)!).to.equal(stage)
  expect(asm.getStage(2)!).to.equal(oldStage)

  const expected: StageAddedEvent = {
    type: "stage-added",
    assembly: asm,
    stage,
  }
  expect(eventListener).calledWith(expected)
  expect(sp).calledWith(expected)

  const anotherInserted = asm.insertStage(1)
  expect(anotherInserted).not.to.be(stage)
  expect(getStageAtSurface(anotherInserted.surface.index)).to.equal(anotherInserted)
  expect(getStageAtSurface(stage.surface.index)).to.equal(stage)
  expect(getStageAtSurface(oldStage.surface.index)).to.equal(oldStage)
  expect(anotherInserted.name.get()).to.equal("<New stage> (1)")

  expect(anotherInserted.stageNumber).to.equal(1)
  expect(stage.stageNumber).to.equal(2)
  expect(oldStage.stageNumber).to.equal(3)

  expect(asm.getStage(1)!).to.equal(anotherInserted)
  expect(asm.getStage(2)!).to.equal(stage)
  expect(asm.getStage(3)!).to.equal(oldStage)
})

test("delete stage", () => {
  const sp = mock.fn()
  const asm = createUserAssembly("Test", 3)
  asm.localEvents.subscribeIndependently({ invoke: sp })
  eventListener.clear()

  const stage1 = asm.getStage(1)!
  const stage2 = asm.getStage(2)!
  const stage3 = asm.getStage(3)!

  asm.deleteStage(2)

  const stage2Surface = stage2.surface.index
  expect(stage2.valid).to.be(false)

  expect(stage1.stageNumber).to.equal(1)
  expect(stage3.stageNumber).to.equal(2)

  expect(getStageAtSurface(stage1.surface.index)).to.be(stage1)
  expect(getStageAtSurface(stage3.surface.index)).to.be(stage3)
  expect(getStageAtSurface(stage2Surface)).to.be.nil()

  expect(asm.getStage(1)!).to.equal(stage1)
  expect(asm.getStage(2)!).to.equal(stage3)

  const expected: PreStageDeletedEvent = {
    type: "pre-stage-deleted",
    assembly: asm,
    stage: stage2,
  }
  expect(eventListener).calledWith(expected)
  expect(sp).calledWith(expected)
})

test("delete stage by deleting surface", () => {
  const asm = createUserAssembly("Test", 2)
  const stage = asm.getStage(2)!
  game.delete_surface(stage.surface)
  async()
  after_ticks(1, () => {
    expect(stage.valid).to.be(false)
    done()
  })
})

test("deleting last stage deletes assembly", () => {
  const asm = createUserAssembly("Test", 1)
  const stage = asm.getStage(1)!
  stage.deleteInAssembly()
  expect(asm.valid).to.be(false)
})

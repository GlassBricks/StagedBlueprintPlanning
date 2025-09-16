// Copyright (c) 2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { LocalisedString } from "factorio:runtime"
import expect from "tstl-expect"
import { RegisterClass } from "../references"
import { cancelCurrentTask, EnumeratedItemsTask, isTaskRunning, LoopTask, submitTask } from "../task"
import { ElementWrapper, wrap } from "./gui"
import { getPlayer } from "./misc"

let actions: unknown[] = []
before_each(() => {
  actions = []
})

@RegisterClass("TestTask")
class TestTask extends LoopTask {
  constructor() {
    super(5)
  }
  override getTitle(): LocalisedString {
    return "Test task"
  }
  protected doStep(i: number): void {
    actions.push(i)
  }
  protected override getTitleForStep(step: number): LocalisedString {
    return `step ${step}`
  }
  protected override done(): void {
    actions.push("done")
  }
  override cancel(): void {
    actions.push("cancelled")
  }
}

@RegisterClass("TestEnumeratedTask")
class TestEnumeratedTask extends EnumeratedItemsTask<string> {
  constructor() {
    super(["a", "b", "c"])
  }
  override getTitle(): LocalisedString {
    return "Test task"
  }
  protected doTask(i: string): void {
    actions.push(i)
  }
  protected override getTitleForTask(task: string): LocalisedString {
    return "step " + task
  }
  override cancel(): void {
    actions.push("cancelled")
  }
  protected override done(): void {
    actions.push("done")
  }
}

describe("running tasks", () => {
  test("can run task", () => {
    submitTask(new TestTask())

    const expected: unknown[] = []
    on_tick((i) => {
      if (i <= 5) expected.push(i - 1)
      if (i == 5) expected.push("done")
      expect(actions).toEqual(expected)
      expect(isTaskRunning()).toBe(i < 5)

      if (i == 8) done()
    })
  })
  test("can run enumerated task", () => {
    submitTask(new TestEnumeratedTask())

    const expected: unknown[] = []
    on_tick((i) => {
      if (i <= 3) expected.push("abc"[i - 1])
      if (i == 3) expected.push("done")
      expect(actions).toEqual(expected)
      expect(isTaskRunning()).toBe(i < 3)

      if (i == 5) done()
    })
  })

  test("recovers from error", () => {
    submitTask(
      new (class extends TestTask {
        protected override doStep(i: number): void {
          if (i == 2) error("test")
          super.doStep(i)
        }
      })(),
    )

    const expected: unknown[] = []
    on_tick((i) => {
      if (i <= 2) expected.push(i - 1)
      if (i == 3) expected.push("cancelled")
      expect(actions).toEqual(expected)
      expect(isTaskRunning()).toBe(i < 3)

      if (i == 4) done()
    })
  })

  test("runs entire task instantly without gui if game.tick_paused", () => {
    game.tick_paused = true
    after_test(() => (game.tick_paused = false))
    submitTask(new TestTask())
    expect(isTaskRunning()).toBe(false)

    expect(actions).toEqual([0, 1, 2, 3, 4, "done"])
  })

  test("can cancel task immediately", () => {
    submitTask(new TestTask())
    cancelCurrentTask()

    expect(actions).toEqual(["cancelled"])
    expect(isTaskRunning()).toBe(false)
    after_ticks(1, () => {
      expect(actions).toEqual(["cancelled"])
      expect(isTaskRunning()).toBe(false)
    })
  })

  test("can cancel task after a few steps", () => {
    submitTask(new TestTask())
    after_ticks(3, () => cancelCurrentTask())

    const expected: unknown[] = []
    on_tick((i) => {
      if (i <= 3) expected.push(i - 1)
      if (i == 3) expected.push("cancelled")
      expect(actions).toEqual(expected)
      expect(isTaskRunning()).toBe(i < 3)
      if (i == 5) done()
    })
  })

  test("submitting new task cancels old one", () => {
    submitTask(new TestTask())
    after_ticks(3, () => submitTask(new TestTask()))

    on_tick((i) => {
      expect(isTaskRunning()).toBe(i < 5 + 3)
    })
    after_ticks(5 + 3 + 1, () => {
      expect(isTaskRunning()).toBe(false)
      expect(actions).toEqual([0, 1, 2, "cancelled", 0, 1, 2, 3, 4, "done"])
      done()
    })
  })
})

describe("task gui", () => {
  let frame: ElementWrapper<"frame">
  let currentTaskLabel: ElementWrapper<"label">
  let currentTaskProgress: ElementWrapper<"progressbar">
  before_each(() => {
    submitTask(new TestTask())

    frame = wrap(getPlayer().gui.screen).find("frame", (x) => x.caption == "Test task")
    currentTaskLabel = frame.find("label")
    currentTaskProgress = frame.find("progressbar")
  })
  test("gui works", () => {
    expect(currentTaskLabel.element).toMatchTable({ caption: "step 0", visible: true })
    expect(currentTaskProgress.element).toMatchTable({ value: 0, visible: true })

    on_tick((i) => {
      if (i < 5) {
        expect(currentTaskLabel.element).toMatchTable({
          caption: "step " + i,
          visible: true,
        })
        expect(currentTaskProgress.element).toMatchTable({
          value: i / 5,
          visible: true,
        })
      } else {
        expect(frame.element.valid).toBe(false)
      }
      if (i == 8) done()
    })
  })

  test("can cancel from gui", () => {
    after_ticks(3, () => {
      const button = frame.find("button")
      button.click()

      expect(isTaskRunning()).toBe(false)
      expect(actions).toEqual([0, 1, 2, "cancelled"])
      expect(frame.element.valid).toBe(false)
    })
  })
})

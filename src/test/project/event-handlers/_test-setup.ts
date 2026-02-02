import { LuaPlayer, LuaSurface } from "factorio:runtime"
import { mock } from "tstl-expect"
import { _assertInValidState, _resetState } from "../../../project/event-handlers"
import { Project } from "../../../project/Project"
import { ProjectActions } from "../../../project/actions/ProjectActions"
import { UndoHandler } from "../../../project/actions/undo"
import { _deleteAllProjects, createProject } from "../../../project/Project"
import * as _createBpWithStageInfo from "../../../ui/create-blueprint-with-stage-info"
import { fStubClass } from "../../f-mock"
import { moduleMock } from "../../module-mock"
import { Pos } from "../../../lib/geometry"

export interface EventHandlerTestContext {
  getProject(): Project & { actions: mock.MockedObject<ProjectActions> }
  getSurface(): LuaSurface
  getPlayer(): LuaPlayer
  getExpectedNumCalls(): number
  setExpectedNumCalls(n: number): void
  getUndoFn(): ReturnType<typeof mock.fnNoSelf>
  TestUndo: ReturnType<typeof UndoHandler<string>>
  CreateBpWithStageInfo: ReturnType<typeof moduleMock<typeof _createBpWithStageInfo>>
}

export const pos = Pos(0.5, 0.5)

let setupCounter = 0
export function setupEventHandlerTests(): EventHandlerTestContext {
  const setupId = ++setupCounter
  let project: Project & { actions: mock.MockedObject<ProjectActions> }
  let surface: LuaSurface
  let player: LuaPlayer
  let expectedNumCalls = 1
  let undoFn: ReturnType<typeof mock.fnNoSelf>

  const CreateBpWithStageInfo = moduleMock(_createBpWithStageInfo, false)

  before_all(() => {
    player = game.players[1]
    project = createProject("Test", 2) as any
    fStubClass(project.actions)
    surface = project.getStage(1)!.getSurface()
    player.teleport(pos, surface)
  })
  before_each(() => {
    mock.clear(project.actions)
    player.teleport(pos, surface)
  })
  after_all(() => {
    _deleteAllProjects()
  })

  before_each(() => {
    _resetState()
    expectedNumCalls = 1
    surface.find_entities().forEach((e) => e.destroy())
    project.actions.onEntityPossiblyUpdated.returns({} as any)
    mock.clear(project.actions)
  })
  after_each(() => {
    _assertInValidState()
    player?.cursor_stack?.clear()

    let totalCalls = 0
    const calls = new LuaMap<string, number>()
    for (const [key, value] of pairs(project.actions)) {
      if (!mock.isMock(value)) continue
      totalCalls += value.calls.length
      calls.set(key, value.calls.length)
    }
    for (const [key, value] of pairs(CreateBpWithStageInfo)) {
      if (!mock.isMock(value)) continue
      totalCalls += value.calls.length
      calls.set(key, value.calls.length)
    }
    if (totalCalls != expectedNumCalls) {
      error(
        `Expected ${expectedNumCalls} calls, got ${totalCalls} calls.\n` +
          Object.entries(calls)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${k}: ${v}`)
            .join("\n"),
      )
    }
  })

  before_each(() => {
    undoFn = mock.fnNoSelf()
  })

  const TestUndo = UndoHandler(`event listener test undo ${setupId}`, (_, data: string) => undoFn(data))

  return {
    getProject: () => project,
    getSurface: () => surface,
    getPlayer: () => player,
    getExpectedNumCalls: () => expectedNumCalls,
    setExpectedNumCalls: (n: number) => {
      expectedNumCalls = n
    },
    getUndoFn: () => undoFn,
    TestUndo,
    CreateBpWithStageInfo,
  }
}

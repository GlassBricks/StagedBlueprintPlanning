import expect, { mock } from "tstl-expect"
import { ContentObserver, MutableProjectContent, newProjectContent, _assertCorrect } from "../../entity/ProjectContent"
import { newProjectEntity, ProjectEntity, StageNumber, UndergroundBeltProjectEntity } from "../../entity/ProjectEntity"
import { ProjectWireConnection } from "../../entity/wire-connection"
import { UndergroundBeltEntity } from "../../entity/Entity"

function createMockObserver(): mock.MockedObject<ContentObserver> {
  return mock.all<ContentObserver>(
    {
      onEntityAdded() {},
      onEntityDeleted() {},
      onEntityChanged() {},
      onEntityLastStageChanged() {},
      onEntityBecameSettingsRemnant() {},
      onEntityRevived() {},
      onWiresChanged() {},
      onStageDiscarded() {},
      onStageMerged() {},
    },
    true,
  )
}

function makeEntity(x: number = 0, stage: StageNumber = 1): ProjectEntity {
  return newProjectEntity({ name: "inserter" }, { x, y: 0 }, 0, stage)
}

function makeWireConnection(from: ProjectEntity, to: ProjectEntity): ProjectWireConnection {
  return {
    fromEntity: from,
    toEntity: to,
    fromId: defines.wire_connector_id.circuit_red,
    toId: defines.wire_connector_id.circuit_red,
  }
}

let content: MutableProjectContent
let observer: mock.MockedObject<ContentObserver>

before_each(() => {
  content = newProjectContent()
  observer = createMockObserver()
  content.setObserver(observer)
})
after_each(() => {
  _assertCorrect(content)
})

describe("MutableProjectContent mutations", () => {
  describe("addEntity()", () => {
    test("fires onEntityAdded", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      expect(observer.onEntityAdded).toHaveBeenCalledWith(entity)
    })

    test("does not fire if entity already added", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityAdded.clear()
      content.addEntity(entity)
      expect(observer.onEntityAdded).not.toHaveBeenCalled()
    })
  })

  describe("deleteEntity()", () => {
    test("fires onEntityDeleted", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.deleteEntity(entity)
      expect(observer.onEntityDeleted).toHaveBeenCalledWith(entity)
    })

    test("does not fire if entity not in content", () => {
      const entity = makeEntity()
      content.deleteEntity(entity)
      expect(observer.onEntityDeleted).not.toHaveBeenCalled()
    })
  })

  describe("changeEntityPosition()", () => {
    test("fires onEntityChanged with firstStage", () => {
      const entity = makeEntity(0, 3)
      content.addEntity(entity)
      content.changeEntityPosition(entity, { x: 5, y: 5 })
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 3)
    })

    test("does not fire when position unchanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.changeEntityPosition(entity, { x: 0, y: 0 })
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("setEntityDirection()", () => {
    test("fires onEntityChanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.setEntityDirection(entity, defines.direction.east)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, entity.firstStage)
    })
  })

  describe("setEntityFirstStage()", () => {
    test("fires onEntityChanged with min of old and new stage", () => {
      const entity = makeEntity(0, 3)
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.setEntityFirstStage(entity, 1)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("fires with old stage when moving up", () => {
      const entity = makeEntity(0, 1)
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.setEntityFirstStage(entity, 3)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })
  })

  describe("setEntityLastStage()", () => {
    test("fires onEntityLastStageChanged with old last stage", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.setEntityLastStage(entity, 5)
      expect(observer.onEntityLastStageChanged).toHaveBeenCalledWith(entity, nil)
    })

    test("preserves old last stage value", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.setEntityLastStage(entity, 5)
      observer.onEntityLastStageChanged.clear()
      content.setEntityLastStage(entity, 3)
      expect(observer.onEntityLastStageChanged).toHaveBeenCalledWith(entity, 5)
    })
  })

  describe("adjustEntityValue()", () => {
    test("fires onEntityChanged when value changes", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.adjustEntityValue(entity, 1, { name: "transport-belt" })
      expect(changed).toBe(true)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("does not fire when value unchanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.adjustEntityValue(entity, 1, { name: "inserter" })
      expect(changed).toBe(false)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("setEntityProp()", () => {
    test("fires onEntityChanged when prop changes", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.setEntityProp(entity, 1, "name", "transport-belt")
      expect(changed).toBe(true)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("does not fire when prop unchanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.setEntityProp(entity, 1, "name", "inserter")
      expect(changed).toBe(false)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("applyEntityUpgrade()", () => {
    test("fires onEntityChanged when upgrade applied", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.applyEntityUpgrade(entity, 1, { name: "fast-inserter" })
      expect(changed).toBe(true)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("does not fire when upgrade is same", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.applyEntityUpgrade(entity, 1, { name: "inserter" })
      expect(changed).toBe(false)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("resetEntityValue()", () => {
    test("fires onEntityChanged when reset removes diff", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.adjustEntityValue(entity, 2, { name: "transport-belt" })
      observer.onEntityChanged.clear()
      const changed = content.resetEntityValue(entity, 2)
      expect(changed).toBe(true)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 2)
    })

    test("does not fire when no diff to reset", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.resetEntityValue(entity, 2)
      expect(changed).toBe(false)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("resetEntityProp()", () => {
    test("fires onEntityChanged when prop reset removes diff", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.setEntityProp(entity, 2, "name", "transport-belt")
      observer.onEntityChanged.clear()
      const changed = content.resetEntityProp(entity, 2, "name")
      expect(changed).toBe(true)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 2)
    })

    test("does not fire when no diff to reset", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.resetEntityProp(entity, 2, "name")
      expect(changed).toBe(false)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("moveEntityValueDown()", () => {
    test("fires onEntityChanged with returned stage", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.adjustEntityValue(entity, 2, { name: "transport-belt" })
      observer.onEntityChanged.clear()
      const result = content.moveEntityValueDown(entity, 2)
      expect(result).toBe(1)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("does not fire when no diff to move", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const result = content.moveEntityValueDown(entity, 2)
      expect(result).toBeNil()
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("moveEntityPropDown()", () => {
    test("fires onEntityChanged with returned stage", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.setEntityProp(entity, 2, "name", "transport-belt")
      observer.onEntityChanged.clear()
      const result = content.moveEntityPropDown(entity, 2, "name")
      expect(result).toBe(1)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("does not fire when no diff to move", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const result = content.moveEntityPropDown(entity, 2, "name")
      expect(result).toBeNil()
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("setEntityValue()", () => {
    test("fires onEntityChanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.setEntityValue(entity, { name: "transport-belt" }, nil)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, entity.firstStage)
    })
  })

  describe("setEntityUnstagedValue()", () => {
    test("fires onEntityChanged when value set", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      const changed = content.setEntityUnstagedValue(entity, 1, { _forTest: "bar" })
      expect(changed).toBe(true)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, 1)
    })

    test("does not fire when unchanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.setEntityUnstagedValue(entity, 1, { _forTest: "bar" })
      observer.onEntityChanged.clear()
      const changed = content.setEntityUnstagedValue(entity, 1, { _forTest: "bar" })
      expect(changed).toBe(false)
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
    })
  })

  describe("clearEntityUnstagedValues()", () => {
    test("fires onEntityChanged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.clearEntityUnstagedValues(entity)
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, entity.firstStage)
    })
  })

  describe("makeEntitySettingsRemnant()", () => {
    test("fires onEntityBecameSettingsRemnant", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.makeEntitySettingsRemnant(entity)
      expect(observer.onEntityBecameSettingsRemnant).toHaveBeenCalledWith(entity)
    })
  })

  describe("reviveEntity()", () => {
    test("fires onEntityRevived", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.makeEntitySettingsRemnant(entity)
      observer.onEntityRevived.clear()
      content.reviveEntity(entity, 2)
      expect(observer.onEntityRevived).toHaveBeenCalledWith(entity)
    })
  })

  describe("addWireConnection()", () => {
    test("fires onWiresChanged for both entities", () => {
      const entity1 = makeEntity(0)
      const entity2 = makeEntity(1)
      content.addEntity(entity1)
      content.addEntity(entity2)
      observer.onWiresChanged.clear()
      const connection = makeWireConnection(entity1, entity2)
      content.addWireConnection(connection)
      expect(observer.onWiresChanged).toHaveBeenCalledWith(entity1)
      expect(observer.onWiresChanged).toHaveBeenCalledWith(entity2)
    })
  })

  describe("removeWireConnection()", () => {
    test("fires onWiresChanged for both entities", () => {
      const entity1 = makeEntity(0)
      const entity2 = makeEntity(1)
      content.addEntity(entity1)
      content.addEntity(entity2)
      const connection = makeWireConnection(entity1, entity2)
      content.addWireConnection(connection)
      observer.onWiresChanged.clear()
      content.removeWireConnection(connection)
      expect(observer.onWiresChanged).toHaveBeenCalledWith(entity1)
      expect(observer.onWiresChanged).toHaveBeenCalledWith(entity2)
    })
  })

  describe("setUndergroundBeltType()", () => {
    test("fires onEntityChanged", () => {
      const entity: UndergroundBeltProjectEntity = newProjectEntity(
        { name: "underground-belt", type: "input" } as UndergroundBeltEntity,
        { x: 0, y: 0 },
        0,
        1,
      )
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.setUndergroundBeltType(entity, "output")
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, entity.firstStage)
    })
  })

  describe("setInserterPositions()", () => {
    test("fires onEntityChanged", () => {
      const entity = newProjectEntity({ name: "inserter" }, { x: 0, y: 0 }, 0, 1)
      content.addEntity(entity)
      observer.onEntityChanged.clear()
      content.setInserterPositions(entity, { x: 1, y: 0 }, { x: -1, y: 0 })
      expect(observer.onEntityChanged).toHaveBeenCalledWith(entity, entity.firstStage)
    })
  })

  describe("mergeStage()", () => {
    test("fires onStageMerged", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      content.mergeStage(2)
      expect(observer.onStageMerged).toHaveBeenCalledWith(2)
    })
  })

  describe("discardStage()", () => {
    test("fires onStageDiscarded with deleted/updated/tiles", () => {
      const entity1 = makeEntity(0, 1)
      const entity2 = makeEntity(1, 3)
      content.addEntity(entity1)
      content.addEntity(entity2)
      content.discardStage(3)
      expect(observer.onStageDiscarded).toHaveBeenCalled()
      const call = observer.onStageDiscarded.lastCall!
      expect(call[0]).toBe(3)
      const deleted = call[1]
      expect(deleted).toHaveLength(1)
      expect(deleted[0]).toBe(entity2)
    })
  })

  describe("insertStage()", () => {
    test("does not fire any observer notification", () => {
      const entity = makeEntity()
      content.addEntity(entity)
      observer.onEntityAdded.clear()
      content.insertStage(2)
      expect(observer.onEntityAdded).not.toHaveBeenCalled()
      expect(observer.onEntityChanged).not.toHaveBeenCalled()
      expect(observer.onStageMerged).not.toHaveBeenCalled()
    })
  })

  describe("setObserver()", () => {
    test("no notifications when observer is nil", () => {
      content.setObserver(nil)
      const entity = makeEntity()
      content.addEntity(entity)
      expect(observer.onEntityAdded).not.toHaveBeenCalled()
    })
  })
})

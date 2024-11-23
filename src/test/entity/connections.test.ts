/*
 * Copyright (c) 2024 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import expect from "tstl-expect"
import { ProjectCircuitConnection } from "../../entity/circuit-connection"
import { _assertCorrect, MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import {
  addCircuitConnection,
  CableAddResult,
  createProjectEntityNoCopy,
  ProjectEntity,
  removeCircuitConnection,
} from "../../entity/ProjectEntity"

let content: MutableProjectContent
before_each(() => {
  content = newProjectContent()
})
after_each(() => {
  _assertCorrect(content)
})
describe("connections", () => {
  let entity1: ProjectEntity
  let entity2: ProjectEntity
  function makeProjectEntity(n: number): ProjectEntity {
    return createProjectEntityNoCopy({ name: "foo" }, { x: n, y: 0 }, nil, 1)
  }
  before_each(() => {
    entity1 = makeProjectEntity(1)
    entity2 = makeProjectEntity(2)
    content.addEntity(entity1)
    content.addEntity(entity2)
  })
  describe("circuit connections", () => {
    function createCircuitConnection(
      fromEntity: ProjectEntity,
      toEntity: ProjectEntity,
      wireType: defines.wire_type = defines.wire_type.red,
    ): ProjectCircuitConnection {
      return {
        fromEntity,
        toEntity,
        fromId:
          wireType == defines.wire_type.red
            ? defines.wire_connector_id.circuit_red
            : defines.wire_connector_id.circuit_green,
        toId:
          wireType == defines.wire_type.red
            ? defines.wire_connector_id.circuit_red
            : defines.wire_connector_id.circuit_green,
      }
    }

    test("getCircuitConnections initially empty", () => {
      expect(entity1.circuitConnections).toBeNil()
    })

    test("addCircuitConnection shows up in getCircuitConnections", () => {
      const connection = createCircuitConnection(entity1, entity2)
      addCircuitConnection(connection)
      expect(entity1.circuitConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.circuitConnections!.get(entity1)).toEqual(newLuaSet(connection))
      const connection2 = createCircuitConnection(entity1, entity2, defines.wire_type.green)
      addCircuitConnection(connection2)
      expect(entity1.circuitConnections!.get(entity2)).toEqual(newLuaSet(connection, connection2))
      expect(entity2.circuitConnections!.get(entity1)).toEqual(newLuaSet(connection, connection2))
    })

    test("does not add if identical connection is already present", () => {
      const connection = createCircuitConnection(entity1, entity2)
      const connection2 = createCircuitConnection(entity2, entity1)
      addCircuitConnection(connection)
      addCircuitConnection(connection2)
      expect(entity1.circuitConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.circuitConnections!.get(entity1)).toEqual(newLuaSet(connection))
    })

    test("removeCircuitConnection removes connection", () => {
      const connection = createCircuitConnection(entity1, entity2)
      addCircuitConnection(connection)
      removeCircuitConnection(connection)

      expect(entity1.circuitConnections).toBeNil()
      expect(entity2.circuitConnections).toBeNil()
    })

    test("deleting entity removes ingoing connections only", () => {
      const connection = createCircuitConnection(entity1, entity2)
      addCircuitConnection(connection)
      content.deleteEntity(entity1)
      expect(entity2.circuitConnections).toEqual(nil)
      expect(entity1.circuitConnections!.get(entity2)).toEqual(newLuaSet(connection))
    })

    test("adding back a deleted entity restores connections", () => {
      const connection = createCircuitConnection(entity1, entity2)
      addCircuitConnection(connection)
      content.deleteEntity(entity1)
      content.addEntity(entity1)
      expect(entity1.circuitConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.circuitConnections!.get(entity1)).toEqual(newLuaSet(connection))

      content.deleteEntity(entity1)
      content.deleteEntity(entity2)
      content.addEntity(entity2)
      content.addEntity(entity1)
      expect(entity1.circuitConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.circuitConnections!.get(entity1)).toEqual(newLuaSet(connection))
    })

    test("won't restore connection to deleted entity", () => {
      const connection = createCircuitConnection(entity1, entity2)
      addCircuitConnection(connection)
      content.deleteEntity(entity1)
      content.deleteEntity(entity2)
      content.addEntity(entity1)
      expect(entity1.circuitConnections).toEqual(nil)
      expect(entity2.circuitConnections).toEqual(nil)
    })
  })

  describe("cable connections", () => {
    test("getCableConnections initially empty", () => {
      expect(entity1.cableConnections).toBeNil()
    })

    test("addCableConnection shows up in getCableConnections", () => {
      expect(entity1.tryAddDualCableConnection(entity2)).toBe(CableAddResult.MaybeAdded)
      expect(entity1.cableConnections!).toEqual(newLuaSet(entity2))
      expect(entity2.cableConnections!).toEqual(newLuaSet(entity1))
    })

    test("removeCableConnection removes connection", () => {
      entity1.tryAddDualCableConnection(entity2)
      entity2.removeDualCableConnection(entity1)

      expect(entity1.cableConnections).toEqual(nil)
      expect(entity2.cableConnections).toEqual(nil)
    })

    test("deleting entity removes ingoing connections only", () => {
      entity1.tryAddDualCableConnection(entity2)
      content.deleteEntity(entity1)
      expect(entity2.cableConnections).toEqual(nil)
      expect(entity1.cableConnections).toEqual(newLuaSet(entity2))
    })

    test("adding back a deleted entity restores connections", () => {
      entity1.tryAddDualCableConnection(entity2)
      content.deleteEntity(entity1)
      content.addEntity(entity1)
      expect(entity1.cableConnections).toEqual(newLuaSet(entity2))
      expect(entity2.cableConnections).toEqual(newLuaSet(entity1))

      content.deleteEntity(entity1)
      content.deleteEntity(entity2)
      content.addEntity(entity2)
      content.addEntity(entity1)

      expect(entity1.cableConnections).toEqual(newLuaSet(entity2))
      expect(entity2.cableConnections).toEqual(newLuaSet(entity1))
    })

    test("won't restore connection to deleted entity", () => {
      entity1.tryAddDualCableConnection(entity2)
      content.deleteEntity(entity1)
      content.deleteEntity(entity2)
      content.addEntity(entity1)
      expect(entity1.cableConnections).toEqual(nil)
      expect(entity2.cableConnections).toEqual(nil)
    })

    test("can't add cable to itself", () => {
      expect(entity1.tryAddDualCableConnection(entity1)).toBe(CableAddResult.Error)
    })

    test("adding same cable twice does nothing", () => {
      expect(entity1.tryAddDualCableConnection(entity2)).toBe(CableAddResult.MaybeAdded)
      expect(entity1.tryAddDualCableConnection(entity2)).toBe(CableAddResult.MaybeAdded)
    })

    test("won't add if max connections is reached", () => {
      for (let i = 3; i < 3 + 5; i++) {
        const entity = makeProjectEntity(i)
        content.addEntity(entity)
        expect(entity1.tryAddDualCableConnection(entity)).toBe(CableAddResult.MaybeAdded)
      }
      expect(entity1.tryAddDualCableConnection(entity2)).toBe(CableAddResult.MaxConnectionsReached)
    })
  })
})

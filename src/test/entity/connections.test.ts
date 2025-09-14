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
import { _assertCorrect, MutableProjectContent, newProjectContent } from "../../entity/ProjectContent"
import { addWireConnection, newProjectEntity, ProjectEntity, removeWireConnection } from "../../entity/ProjectEntity"
import { ProjectWireConnection } from "../../entity/wire-connection"

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
    return newProjectEntity({ name: "foo" }, { x: n, y: 0 }, 0, 1)
  }
  before_each(() => {
    entity1 = makeProjectEntity(1)
    entity2 = makeProjectEntity(2)
    content.addEntity(entity1)
    content.addEntity(entity2)
  })
  describe("circuit connections", () => {
    function createwireConnection(
      fromEntity: ProjectEntity,
      toEntity: ProjectEntity,
      wireType: defines.wire_type = defines.wire_type.red,
    ): ProjectWireConnection {
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

    test("getwireConnections initially empty", () => {
      expect(entity1.wireConnections).toBeNil()
    })

    test("addwireConnection shows up in getwireConnections", () => {
      const connection = createwireConnection(entity1, entity2)
      addWireConnection(connection)
      expect(entity1.wireConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.wireConnections!.get(entity1)).toEqual(newLuaSet(connection))
      const connection2 = createwireConnection(entity1, entity2, defines.wire_type.green)
      addWireConnection(connection2)
      expect(entity1.wireConnections!.get(entity2)).toEqual(newLuaSet(connection, connection2))
      expect(entity2.wireConnections!.get(entity1)).toEqual(newLuaSet(connection, connection2))
    })

    test("does not add if identical connection is already present", () => {
      const connection = createwireConnection(entity1, entity2)
      const connection2 = createwireConnection(entity2, entity1)
      addWireConnection(connection)
      addWireConnection(connection2)
      expect(entity1.wireConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.wireConnections!.get(entity1)).toEqual(newLuaSet(connection))
    })

    test("removewireConnection removes connection", () => {
      const connection = createwireConnection(entity1, entity2)
      addWireConnection(connection)
      removeWireConnection(connection)

      expect(entity1.wireConnections).toBeNil()
      expect(entity2.wireConnections).toBeNil()
    })

    test("deleting entity removes ingoing connections only", () => {
      const connection = createwireConnection(entity1, entity2)
      addWireConnection(connection)
      content.deleteEntity(entity1)
      expect(entity2.wireConnections).toEqual(nil)
      expect(entity1.wireConnections!.get(entity2)).toEqual(newLuaSet(connection))
    })

    test("adding back a deleted entity restores connections", () => {
      const connection = createwireConnection(entity1, entity2)
      addWireConnection(connection)
      content.deleteEntity(entity1)
      content.addEntity(entity1)
      expect(entity1.wireConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.wireConnections!.get(entity1)).toEqual(newLuaSet(connection))

      content.deleteEntity(entity1)
      content.deleteEntity(entity2)
      content.addEntity(entity2)
      content.addEntity(entity1)
      expect(entity1.wireConnections!.get(entity2)).toEqual(newLuaSet(connection))
      expect(entity2.wireConnections!.get(entity1)).toEqual(newLuaSet(connection))
    })

    test("won't restore connection to deleted entity", () => {
      const connection = createwireConnection(entity1, entity2)
      addWireConnection(connection)
      content.deleteEntity(entity1)
      content.deleteEntity(entity2)
      content.addEntity(entity1)
      expect(entity1.wireConnections).toEqual(nil)
      expect(entity2.wireConnections).toEqual(nil)
    })
  })
})

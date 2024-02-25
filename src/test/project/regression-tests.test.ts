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
import { getDirectionalInfo } from "../../entity/circuit-connection"
import { first } from "../../lib"
import { getPlayer } from "../../lib/test/misc"
import { Project } from "../../project/ProjectDef"
import { _deleteAllProjects, createUserProject } from "../../project/UserProject"

let project: Project

before_each(() => {
  project = createUserProject("test", 3)
})

after_each(() => {
  _deleteAllProjects()
})

test("bug: circuit wire does not connect to power switch", () => {
  const blueprintString =
    "0eNq1VF2O2jAQvss8JyviBBbyUGmXY1SrKDimO5JjR/6BIpQD9CC9WE/SsQOUhSBB232JMn/fzDfjmT2spBedQeWg3ANyrSyUX/dg8ZuqZdC5XSegBHSihQRU3Qap5ty3XtZOG+gTQNWI71Bm/VsCQjl0KAaYKOwq5duVMORwAmgEx0aYlOt2hSriJNBpS6FahbQEl7MEdlCm2dOUcjRoBB+spKdCndGyWon3eoMUTSEHzIpsTcSxQbtGY111xWeDxnnSnCoaPNKXwMeKgHF/0GsIIipdbSKVEr6Qj/au8w+kXg4o3Y4YeOWqtdFthYowoFzX0oo+2pUa+hDZZeFjRHPebSSJ9ckHOe/fKJjd8C7I2p9FHOfFRgd+PahJHBTrx+fyaB+om/cTpSfF0XCPbhBvMMnvZML+K5OXT2BSnJJ0eksbZLfo+PsIlSxSKW5QOaY6Lctf7MrhwSrr6nA/Jhc78OvHz3/gz+KLXfrJpd8sgS3dgvg/CRdn6bNLn+lHn7DSsU0VlerEcZ2umzv9Q7GtpUyFpMIN8rTTUoz0uHiaxi7ndKJG4GaPwbH5Aa4IcMQsHt3y7EYnsBHGDkdwnhXPC/Y8Lxb5bDHr+99IcPqZ"
  const player = getPlayer()

  player.teleport([0, 0], project.getSurface(2))
  const cursor = player.cursor_stack!
  cursor.set_stack("blueprint")
  expect(cursor.import_stack(blueprintString)).toBe(0)

  player.build_from_cursor({ position: [0, 0] })

  const entities = Object.keys(project.content.allEntities())
  const powerSwitch = entities.find((e) => e.firstValue.name == "power-switch")!
  const accumulators = entities.filter((e) => e.firstValue.name == "accumulator")
  const combinator = entities.find((e) => e.firstValue.name == "decider-combinator")!
  expect(powerSwitch).toBeAny()
  expect(accumulators).toHaveLength(2)
  expect(combinator).toBeAny()

  const connection = first(powerSwitch.circuitConnections!.get(combinator)!)!
  expect(connection).toBeAny()
  const [, , toId] = getDirectionalInfo(connection, powerSwitch)
  expect(toId).toEqual(defines.circuit_connector_id.combinator_output)

  for (const accumulator of accumulators) {
    const connection = first(accumulator.circuitConnections!.get(combinator)!)!
    expect(connection).toBeAny()
    const [, toId] = getDirectionalInfo(connection, accumulator)
    expect(toId).toEqual(defines.circuit_connector_id.combinator_input)
  }
})

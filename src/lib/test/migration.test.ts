/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { VersionString } from "factorio:common"
import expect from "tstl-expect"
import { formatVersion, Migrations } from "../migration"

test("formatVersion", () => {
  expect(formatVersion("1.2.3")).to.equal("01.02.03")
  expect(formatVersion("01.02.03")).to.equal("01.02.03")
})

test.each<[VersionString, VersionString, boolean]>([
  ["1.2.3", "1.2.4", true],
  ["1.2.3", "1.2.3", false],
  ["1.1.3", "1.2.2", true],
  ["1.2.3", "1.1.4", false],
  ["1.2.3", "2.1.0", true],
  ["2.1.0", "1.2.3", false],
])("versionStrLess: %s < %s => %s", (a, b, expected) => {
  expect(formatVersion(a) < formatVersion(b)).to.be(expected)
})

describe("Migrations", () => {
  let run: string[]
  before_each(() => {
    run = []
    Migrations._prepareMock()
  })

  test("runs later migrations, in sorted order", () => {
    for (const version of ["1.2.5", "1.2.4", "1.2.3"] as const) Migrations.to(version, () => run.push(version))
    Migrations.doMigrations("1.2.3")
    expect(run).to.equal(["1.2.4", "1.2.5"])
  })

  test("runs early migrations before later migrations", () => {
    for (const version of ["1.2.5", "1.2.4", "1.2.3"] as const) {
      Migrations.to(version, () => run.push(version))
    }
    for (const version of ["1.2.5", "1.2.4", "1.2.3"] as const) {
      Migrations.early(version, () => run.push(version + " e"))
    }
    for (const version of ["1.2.5", "1.2.4", "1.2.3"] as const) {
      Migrations.priority(5, version, () => run.push(version + " e5"))
    }
    Migrations.doMigrations("1.2.3")
    expect(run).to.equal(["1.2.4 e5", "1.2.5 e5", "1.2.4 e", "1.2.5 e", "1.2.4", "1.2.5"])
  })
})

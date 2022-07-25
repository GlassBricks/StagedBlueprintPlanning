/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of BBPP3.
 *
 * BBPP3 is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * BBPP3 is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with Foobar. If not, see <https://www.gnu.org/licenses/>.
 */

import { formatVersion, Migrations } from "./migration"

test("formatVersion", () => {
  assert.same("01.02.03", formatVersion("1.2.3"))
  assert.same("01.02.03", formatVersion("01.02.03"))
})

test.each<[string, string, boolean]>(
  [
    ["1.2.3", "1.2.4", true],
    ["1.2.3", "1.2.3", false],
    ["1.1.3", "1.2.2", true],
    ["1.2.3", "1.1.4", false],
    ["1.2.3", "2.1.0", true],
    ["2.1.0", "1.2.3", false],
  ],
  "versionStrLess: %s < %s => %s",
  (a, b, expected) => {
    assert.equal(expected, formatVersion(a) < formatVersion(b))
  },
)

describe("Migrations", () => {
  let run: string[]
  before_each(() => {
    run = []
    Migrations._prepareMock()
  })

  test("runs later migrations, in sorted order", () => {
    for (const version of ["1.2.5", "1.2.4", "1.2.3"]) Migrations.from(version, () => run.push(version))
    Migrations._doMigrations("1.2.3")
    assert.same(["1.2.4", "1.2.5"], run)
  })
})

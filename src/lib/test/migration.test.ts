// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import { VersionString } from "factorio:common"
import expect from "tstl-expect"
import { formatVersion, Migrations } from "../migration"

test("formatVersion", () => {
  expect(formatVersion("1.2.3")).toEqual("01.02.03")
  expect(formatVersion("01.02.03")).toEqual("01.02.03")
})

test.each<[VersionString, VersionString, boolean]>([
  ["1.2.3", "1.2.4", true],
  ["1.2.3", "1.2.3", false],
  ["1.1.3", "1.2.2", true],
  ["1.2.3", "1.1.4", false],
  ["1.2.3", "2.1.0", true],
  ["2.1.0", "1.2.3", false],
])("versionStrLess: %s < %s => %s", (a, b, expected) => {
  expect(formatVersion(a) < formatVersion(b)).toBe(expected)
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
    expect(run).toEqual(["1.2.4", "1.2.5"])
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
    expect(run).toEqual(["1.2.4 e5", "1.2.5 e5", "1.2.4 e", "1.2.5 e", "1.2.4", "1.2.5"])
  })
})

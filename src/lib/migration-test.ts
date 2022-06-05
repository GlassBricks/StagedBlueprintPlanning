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

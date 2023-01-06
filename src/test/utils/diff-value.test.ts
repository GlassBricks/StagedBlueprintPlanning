import expect from "tstl-expect"
import {
  fromDiffValue,
  getDiff,
  getNilPlaceholder,
  getResultValue,
  NilPlaceholder,
  toDiffValue,
} from "../../utils/diff-value"

let nilPlaceholder: NilPlaceholder
before_all(() => {
  nilPlaceholder = getNilPlaceholder()
})
test("toDiffValue", () => {
  expect(toDiffValue(1)).to.be(1)
  expect(toDiffValue(nil)).to.be(nilPlaceholder)
})

test("fromDiffValue", () => {
  expect(fromDiffValue(1)).to.be(1)
  expect(fromDiffValue(nilPlaceholder)).to.be(nil)
})

test("getActualValue", () => {
  expect(getResultValue(1, 2)).to.be(2)
  expect(getResultValue(1, nil)).to.be(1)
  expect(getResultValue(1, nilPlaceholder)).to.be(nil)
})

test("getDiff", () => {
  expect(getDiff(1, 2)).to.be(2)
  expect(getDiff(1, 1)).to.be(nil)
  expect(getDiff(1, nil)).to.be(nilPlaceholder)
})

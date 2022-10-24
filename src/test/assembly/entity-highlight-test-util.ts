/*
 * Copyright (c) 2022 GlassBricks
 * This file is part of 100% Blueprint Planning.
 *
 * 100% Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * 100% Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with 100% Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import { HighlightValues } from "../../assembly/EntityHighlighter"
import { AssemblyEntity, StageNumber } from "../../entity/AssemblyEntity"
import { SpriteRender } from "../../lib"

export function assertConfigChangedHighlightsCorrect(entity: AssemblyEntity, maxStage: StageNumber): void {
  let i = entity.firstStage
  for (const [stageNumber, changes] of pairs(entity.getStageDiffs() ?? {})) {
    const isUpgrade = changes.name !== nil

    const highlight = assert.not_nil(entity.getExtraEntity("configChangedHighlight", stageNumber)) as HighlightBoxEntity
    assert.equal(
      isUpgrade ? HighlightValues.Upgraded : HighlightValues.ConfigChanged,
      highlight.highlight_box_type,
      "highlight type",
    )

    const firstI = i
    for (; i < stageNumber; i++) {
      if (i !== firstI)
        assert.nil(entity.getExtraEntity("configChangedHighlight", i), "should not have highlight in stage " + i)

      const highlight = assert.not_nil(
        entity.getExtraEntity("configChangedLaterHighlight", i),
        `stage ${i}`,
      ) as SpriteRender
      assert.equal(isUpgrade ? HighlightValues.UpgradedLater : HighlightValues.ConfigChangedLater, highlight.sprite)
    }
  }
  for (let j = i; j <= maxStage; j++) {
    if (j !== i)
      assert.nil(entity.getExtraEntity("configChangedHighlight", j), "should not have highlight in stage " + j)
    assert.nil(entity.getExtraEntity("configChangedLaterHighlight", j), "should not have later highlight in stage " + j)
  }
}

export function assertErrorHighlightsCorrect(entity: AssemblyEntity, maxStage: StageNumber): void {
  let hasAnyMissing = false
  for (const stage of $range(entity.firstStage, maxStage)) {
    if (entity.getWorldEntity(stage) === nil) {
      hasAnyMissing = true
      const highlight = assert.not_nil(entity.getExtraEntity("errorOutline", stage)) as HighlightBoxEntity
      assert.equal(HighlightValues.Error, highlight.highlight_box_type, "highlight type")
    } else {
      assert.nil(entity.getExtraEntity("errorOutline", stage), `should not have highlight in stage ${stage}`)
    }
  }
  if (!hasAnyMissing) {
    assert.false(entity.hasAnyExtraEntities("errorElsewhereIndicator"), "should not have error elsewhere indicator")
  } else {
    for (const stage of $range(1, entity.firstStage - 1)) {
      assert.nil(entity.getExtraEntity("errorElsewhereIndicator", stage), `should not have highlight in stage ${stage}`)
    }
    for (const stage of $range(maxStage + 1, maxStage)) {
      const hasError = entity.getWorldEntity(stage) === nil
      if (hasError) {
        // no indicator
        assert.nil(
          entity.getExtraEntity("errorElsewhereIndicator", stage),
          `should not have error elsewhere indicator in stage ${stage}`,
        )
      } else {
        assert.not_nil(
          entity.getExtraEntity("errorElsewhereIndicator", stage),
          `should have error elsewhere indicator in stage ${stage}`,
        )
      }
    }
  }
}

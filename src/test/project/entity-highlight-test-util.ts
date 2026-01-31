// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { getItemRequestSampleItemName, HighlightConstants } from "../../project/entity-highlights"
import { TestWorldQueries } from "../integration/test-world-queries"

export function assertConfigChangedHighlightsCorrect(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wq: TestWorldQueries,
): void {
  let i = entity.firstStage
  for (const [stageNumber, changes] of pairs(entity.stageDiffs ?? {})) {
    const isUpgrade = changes.name != nil

    const highlight = expect(wq.getExtraEntity(entity, "configChangedHighlight", stageNumber))
      .toBeAny()
      .getValue()!
    expect(highlight.highlight_box_type).toBe(
      isUpgrade ? HighlightConstants.Upgraded : HighlightConstants.ConfigChanged,
    )

    const firstI = i
    for (; i < stageNumber; i++) {
      if (i != firstI) expect(wq.getExtraEntity(entity, "configChangedHighlight", i)).toBeNil()

      const highlight = expect(wq.getExtraEntity(entity, "configChangedLaterHighlight", i))
        .toBeAny()
        .getValue()!
      expect(highlight.sprite).toBe(
        isUpgrade ? HighlightConstants.UpgradedLater : HighlightConstants.ConfigChangedLater,
      )
    }
  }
  for (let j = i; j <= maxStage; j++) {
    if (j != i) expect(wq.getExtraEntity(entity, "configChangedHighlight", j)).toBeNil()
    expect(wq.getExtraEntity(entity, "configChangedLaterHighlight", j)).toBeNil()
  }
}

export function assertErrorHighlightsCorrect(entity: ProjectEntity, maxStage: StageNumber, wq: TestWorldQueries): void {
  let anyHasError = false
  for (const stage of $range(entity.firstStage, maxStage)) {
    if (wq.hasErrorAt(entity, stage)) {
      anyHasError = true
      const highlight = expect(wq.getExtraEntity(entity, "errorOutline", stage))
        .toBeAny()
        .getValue()!
      expect(highlight.highlight_box_type).toBe(HighlightConstants.Error)
    } else {
      expect(wq.getExtraEntity(entity, "errorOutline", stage)).toBeNil()
    }
  }
  if (!anyHasError) {
    expect(wq.hasAnyExtraEntities(entity, "errorElsewhereIndicator")).toBe(false)
  } else {
    for (const stage of $range(1, maxStage)) {
      const hasError = wq.hasErrorAt(entity, stage)
      if (hasError) {
        expect(wq.getExtraEntity(entity, "errorOutline", stage)).not.toBeNil()
        expect(wq.getExtraEntity(entity, "errorElsewhereIndicator", stage)).toBeNil()
      } else {
        expect(wq.getExtraEntity(entity, "errorElsewhereIndicator", stage)).toBeAny()
      }
    }
  }
}

export function assertLastStageHighlightCorrect(entity: ProjectEntity, wq: TestWorldQueries): void {
  if (entity.lastStage != nil && !entity.isMovable()) {
    const highlight = expect(wq.getExtraEntity(entity, "stageDeleteHighlight", entity.lastStage))
      .toBeAny()
      .getValue()!
    expect(highlight).toMatchTable({
      sprite: HighlightConstants.DeletedNextStage,
    })
  } else {
    expect(wq.hasAnyExtraEntities(entity, "stageDeleteHighlight")).toBe(false)
  }
}

export function assertNoHighlightsAfterLastStage(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wq: TestWorldQueries,
): void {
  if (!entity.lastStage) return
  for (const stage of $range(entity.lastStage + 1, maxStage)) {
    expect(wq.getExtraEntity(entity, "configChangedHighlight", stage)).toBeNil()
    expect(wq.getExtraEntity(entity, "configChangedLaterHighlight", stage)).toBeNil()
    expect(wq.getExtraEntity(entity, "errorOutline", stage)).toBeNil()
    expect(wq.getExtraEntity(entity, "errorElsewhereIndicator", stage)).toBeNil()
    expect(wq.getExtraEntity(entity, "stageDeleteHighlight", stage)).toBeNil()
  }
}

export function assertItemRequestHighlightsCorrect(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wq: TestWorldQueries,
): void {
  for (const stage of $range(1, maxStage)) {
    const worldEntity = wq.getWorldEntity(entity, stage)
    const sampleItem = getItemRequestSampleItemName(entity, stage, nil, worldEntity)
    if (sampleItem == nil) {
      expect(wq.getExtraEntity(entity, "itemRequestHighlight", stage)).toBeNil()
      expect(wq.getExtraEntity(entity, "itemRequestHighlightOverlay", stage)).toBeNil()
    } else {
      expect(wq.getExtraEntity(entity, "itemRequestHighlight", stage)).toBeAny()
      const overlay = expect(wq.getExtraEntity(entity, "itemRequestHighlightOverlay", stage))
        .toBeAny()
        .getValue()!
      expect(overlay.sprite).toBe(`item/${sampleItem}`)
    }
  }
}

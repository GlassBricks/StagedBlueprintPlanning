// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { HighlightConstants } from "../../project/entity-highlights"

export function assertConfigChangedHighlightsCorrect(entity: ProjectEntity, maxStage: StageNumber): void {
  let i = entity.firstStage
  for (const [stageNumber, changes] of pairs(entity.stageDiffs ?? {})) {
    const isUpgrade = changes.name != nil

    const highlight = expect(entity.getExtraEntity("configChangedHighlight", stageNumber)).toBeAny().getValue()!
    expect(highlight.highlight_box_type).toBe(
      isUpgrade ? HighlightConstants.Upgraded : HighlightConstants.ConfigChanged,
    )

    const firstI = i
    for (; i < stageNumber; i++) {
      if (i != firstI) expect(entity.getExtraEntity("configChangedHighlight", i)).toBeNil()

      const highlight = expect(entity.getExtraEntity("configChangedLaterHighlight", i)).toBeAny().getValue()!
      expect(highlight.sprite).toBe(
        isUpgrade ? HighlightConstants.UpgradedLater : HighlightConstants.ConfigChangedLater,
      )
    }
  }
  for (let j = i; j <= maxStage; j++) {
    if (j != i) expect(entity.getExtraEntity("configChangedHighlight", j)).toBeNil()
    expect(entity.getExtraEntity("configChangedLaterHighlight", j)).toBeNil()
  }
}

export function assertErrorHighlightsCorrect(entity: ProjectEntity, maxStage: StageNumber): void {
  let anyHasError = false
  for (const stage of $range(entity.firstStage, maxStage)) {
    if (entity.hasErrorAt(stage)) {
      anyHasError = true
      const highlight = expect(entity.getExtraEntity("errorOutline", stage)).toBeAny().getValue()!
      expect(highlight.highlight_box_type).toBe(HighlightConstants.Error)
    } else {
      expect(entity.getExtraEntity("errorOutline", stage)).toBeNil()
    }
  }
  if (!anyHasError) {
    expect(entity.hasAnyExtraEntities("errorElsewhereIndicator")).toBe(false)
  } else {
    for (const stage of $range(1, maxStage)) {
      const hasError = entity.hasErrorAt(stage)
      if (hasError) {
        // no indicator
        expect(entity.getExtraEntity("errorOutline", stage)).not.toBeNil()
        expect(entity.getExtraEntity("errorElsewhereIndicator", stage)).toBeNil()
      } else {
        expect(entity.getExtraEntity("errorElsewhereIndicator", stage)).toBeAny()
      }
    }
  }
}

export function assertLastStageHighlightCorrect(entity: ProjectEntity): void {
  if (entity.lastStage != nil && entity.lastStage != entity.firstStage) {
    const highlight = expect(entity.getExtraEntity("stageDeleteHighlight", entity.lastStage)).toBeAny().getValue()!
    expect(highlight).toMatchTable({
      sprite: HighlightConstants.DeletedNextStage,
    })
  } else {
    expect(entity.hasAnyExtraEntities("stageDeleteHighlight")).toBe(false)
  }
}

export function assertNoHighlightsAfterLastStage(entity: ProjectEntity, maxStage: StageNumber): void {
  if (!entity.lastStage) return
  for (const stage of $range(entity.lastStage + 1, maxStage)) {
    expect(entity.getExtraEntity("configChangedHighlight", stage)).toBeNil()
    expect(entity.getExtraEntity("configChangedLaterHighlight", stage)).toBeNil()
    expect(entity.getExtraEntity("errorOutline", stage)).toBeNil()
    expect(entity.getExtraEntity("errorElsewhereIndicator", stage)).toBeNil()
    expect(entity.getExtraEntity("stageDeleteHighlight", stage)).toBeNil()
  }
}

export function assertItemRequestHighlightsCorrect(entity: ProjectEntity, maxStage: StageNumber): void {
  for (const stage of $range(1, maxStage)) {
    const unstagedValue = entity.getUnstagedValue(stage)
    if (!unstagedValue?.items?.[0]) {
      expect(entity.getExtraEntity("itemRequestHighlight", stage)).toBeNil()
      expect(entity.getExtraEntity("itemRequestHighlightOverlay", stage)).toBeNil()
    } else {
      expect(entity.getExtraEntity("itemRequestHighlight", stage)).toBeAny()
      const overlay = expect(entity.getExtraEntity("itemRequestHighlightOverlay", stage)).toBeAny().getValue()!
      const sampleItem = unstagedValue.items[0].id.name as unknown as string
      expect(overlay.sprite).toBe(`item/${sampleItem}`)
    }
  }
}

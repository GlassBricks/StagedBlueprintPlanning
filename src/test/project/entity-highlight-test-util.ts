// Copyright (c) 2022-2023 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

import expect from "tstl-expect"
import { ProjectEntity, StageNumber } from "../../entity/ProjectEntity"
import { HighlightTypes, getItemRequestSampleItemName, HighlightConstants } from "../../project/EntityHiglights"
import { WorldPresentation } from "../../project/WorldPresentation"

function iterateTypeIsEmpty(wp: WorldPresentation, entity: ProjectEntity, type: keyof HighlightTypes): boolean {
  for (const [,] of wp.entityStorage.iterateType(entity, type)) return false
  return true
}

export function assertConfigChangedHighlightsCorrect(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wp: WorldPresentation,
): void {
  let i = entity.firstStage
  for (const [stageNumber, changes] of pairs(entity.stageDiffs ?? {})) {
    const isUpgrade = changes.name != nil

    const highlight = expect(wp.entityStorage.get(entity, "configChangedHighlight", stageNumber))
      .toBeAny()
      .getValue()!
    expect(highlight.highlight_box_type).toBe(
      isUpgrade ? HighlightConstants.Upgraded : HighlightConstants.ConfigChanged,
    )

    const firstI = i
    for (; i < stageNumber; i++) {
      if (i != firstI) expect(wp.entityStorage.get(entity, "configChangedHighlight", i)).toBeNil()

      const highlight = expect(wp.entityStorage.get(entity, "configChangedLaterHighlight", i))
        .toBeAny()
        .getValue()!
      expect(highlight.sprite).toBe(
        isUpgrade ? HighlightConstants.UpgradedLater : HighlightConstants.ConfigChangedLater,
      )
    }
  }
  for (let j = i; j <= maxStage; j++) {
    if (j != i) expect(wp.entityStorage.get(entity, "configChangedHighlight", j)).toBeNil()
    expect(wp.entityStorage.get(entity, "configChangedLaterHighlight", j)).toBeNil()
  }
}

export function assertErrorHighlightsCorrect(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wp: WorldPresentation,
): void {
  let anyHasError = false
  for (const stage of $range(entity.firstStage, maxStage)) {
    if (wp.hasErrorAt(entity, stage)) {
      anyHasError = true
      const highlight = expect(wp.entityStorage.get(entity, "errorOutline", stage))
        .toBeAny()
        .getValue()!
      expect(highlight.highlight_box_type).toBe(HighlightConstants.Error)
    } else {
      expect(wp.entityStorage.get(entity, "errorOutline", stage)).toBeNil()
    }
  }
  if (!anyHasError) {
    expect(iterateTypeIsEmpty(wp, entity, "errorElsewhereIndicator")).toBe(true)
  } else {
    for (const stage of $range(1, maxStage)) {
      const hasError = wp.hasErrorAt(entity, stage)
      if (hasError) {
        expect(wp.entityStorage.get(entity, "errorOutline", stage)).not.toBeNil()
        expect(wp.entityStorage.get(entity, "errorElsewhereIndicator", stage)).toBeNil()
      } else {
        expect(wp.entityStorage.get(entity, "errorElsewhereIndicator", stage)).toBeAny()
      }
    }
  }
}

export function assertLastStageHighlightCorrect(entity: ProjectEntity, wp: WorldPresentation): void {
  if (entity.lastStage != nil && !entity.isMovable()) {
    const highlight = expect(wp.entityStorage.get(entity, "stageDeleteHighlight", entity.lastStage))
      .toBeAny()
      .getValue()!
    expect(highlight).toMatchTable({
      sprite: HighlightConstants.DeletedNextStage,
    })
  } else {
    expect(iterateTypeIsEmpty(wp, entity, "stageDeleteHighlight")).toBe(true)
  }
}

export function assertNoHighlightsAfterLastStage(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wp: WorldPresentation,
): void {
  if (!entity.lastStage) return
  for (const stage of $range(entity.lastStage + 1, maxStage)) {
    expect(wp.entityStorage.get(entity, "configChangedHighlight", stage)).toBeNil()
    expect(wp.entityStorage.get(entity, "configChangedLaterHighlight", stage)).toBeNil()
    expect(wp.entityStorage.get(entity, "errorOutline", stage)).toBeNil()
    expect(wp.entityStorage.get(entity, "errorElsewhereIndicator", stage)).toBeNil()
    expect(wp.entityStorage.get(entity, "stageDeleteHighlight", stage)).toBeNil()
  }
}

export function assertItemRequestHighlightsCorrect(
  entity: ProjectEntity,
  maxStage: StageNumber,
  wp: WorldPresentation,
): void {
  for (const stage of $range(1, maxStage)) {
    const worldEntity = wp.getWorldEntity(entity, stage)
    const sampleItem = getItemRequestSampleItemName(entity, stage, nil, worldEntity)
    if (sampleItem == nil) {
      expect(wp.entityStorage.get(entity, "itemRequestHighlight", stage)).toBeNil()
      expect(wp.entityStorage.get(entity, "itemRequestHighlightOverlay", stage)).toBeNil()
    } else {
      expect(wp.entityStorage.get(entity, "itemRequestHighlight", stage)).toBeAny()
      const overlay = expect(wp.entityStorage.get(entity, "itemRequestHighlightOverlay", stage))
        .toBeAny()
        .getValue()!
      expect(overlay.sprite).toBe(`item/${sampleItem}`)
    }
  }
}

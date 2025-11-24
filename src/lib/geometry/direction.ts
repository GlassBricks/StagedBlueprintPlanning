// Copyright (c) 2022-2025 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

export function floorToCardinalDirection(direction: defines.direction): defines.direction {
  return (math.floor(direction / 4) * 4) as defines.direction
}

export function applyDirectionTransformation(
  direction: defines.direction,
  flipHorizontal: boolean,
  flipVertical: boolean,
  rotation: defines.direction,
): defines.direction {
  let dir = ((direction + rotation) % 16) as defines.direction

  if (flipHorizontal && flipVertical) {
    dir = ((dir + 8) % 16) as defines.direction
  } else if (flipHorizontal) {
    dir = ((16 - dir) % 16) as defines.direction
  } else if (flipVertical) {
    dir = ((8 - dir + 16) % 16) as defines.direction
  }

  return dir
}

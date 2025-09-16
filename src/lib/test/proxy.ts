// Copyright (c) 2024 GlassBricks
// SPDX-FileCopyrightText: 2025 GlassBricks
//
// SPDX-License-Identifier: LGPL-3.0-or-later

export function proxyGlobalInTest(globalName: string): void {
  const orignValue = (_G as any)[globalName]
  after_test(() => ((_G as any)[globalName] = orignValue))
  const proxied = setmetatable({}, {
    __index: orignValue,
    __newindex: orignValue,
    original: orignValue,
  } as LuaMetatable<any>)
  ;(_G as any)[globalName] = proxied
}

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

import { getStageAtSurface } from "../assembly/Assembly"
import { Stage } from "../assembly/AssemblyDef"
import { Prototypes } from "../constants"
import { AssemblyEntity } from "../entity/AssemblyEntity"

export function getAssemblyEntityOfEntity(entity: LuaEntity): LuaMultiReturn<[Stage, AssemblyEntity] | [_?: nil]> {
  const stage = getStageAtSurface(entity.surface.index)
  if (!stage) return $multi()
  const name = entity.name
  const actualName = name.startsWith(Prototypes.PreviewEntityPrefix)
    ? name.substring(Prototypes.PreviewEntityPrefix.length)
    : name
  const found = stage.assembly.content.findCompatibleAnyDirection(actualName, entity.position)
  if (found) return $multi(stage, found)
  return $multi()
}

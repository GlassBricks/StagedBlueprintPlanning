import { Mutable } from "../lib"
import { Position } from "../lib/geometry"

export interface Entity {
  readonly name: string

  readonly position: Position

  readonly direction: defines.direction | undefined
}

export interface AddEntity extends Entity {
  readonly changedProps?: never
}

export interface UpdateEntity extends Entity {
  readonly changedProps: LuaSet<UpdatableEntityProp>
}

export type MutableAddEntity = Mutable<AddEntity>

export interface MutableUpdateEntity extends Mutable<UpdateEntity> {
  readonly changedProps: MutableLuaSet<UpdatableEntityProp>
}

export type UpdatableEntityProp = string

export type LayerEntity = AddEntity | UpdateEntity
export type MutableLayerEntity = MutableAddEntity | MutableUpdateEntity

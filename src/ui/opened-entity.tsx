/*
 * Copyright (c) 2022-2023 GlassBricks
 * This file is part of Staged Blueprint Planning.
 *
 * Staged Blueprint Planning is free software: you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * Staged Blueprint Planning is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License along with Staged Blueprint Planning. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  BlueprintEntity,
  GuiAnchor,
  GuiLocationArray,
  LocalisedString,
  LuaEntity,
  LuaPlayer,
  OnGuiClickEvent,
  PlayerIndex,
} from "factorio:runtime"
import { BuildableEntityType, Settings } from "../constants"
import { Entity } from "../entity/Entity"
import { ProjectEntity, StageNumber } from "../entity/ProjectEntity"
import { StageDiff } from "../entity/stage-diff"
import { bind, ibind, ProtectedEvents, RegisterClass } from "../lib"
import { Component, destroy, Element, ElemProps, FactorioJsx, RenderContext, renderNamed } from "../lib/factoriojsx"
import { DraggableSpace, HorizontalPusher, RefreshButton, TitleBar } from "../lib/factoriojsx/components"
import { Migrations } from "../lib/migration"
import { L_GuiEntityInfo } from "../locale"
import { checkForEntityUpdates, getCurrentlyOpenedModdedGui } from "../project/event-handlers"
import { ProjectUpdates } from "../project/project-updates"
import { Stage } from "../project/ProjectDef"
import { UserActions } from "../project/user-actions"

import { getProjectEntityOfEntity } from "./entity-util"
import { PlayerChangedStageEvent, teleportToStage } from "./player-current-stage"
import relative_gui_position = defines.relative_gui_position
import relative_gui_type = defines.relative_gui_type

PlayerChangedStageEvent.addListener((player, stage, oldStage) => {
  if (!oldStage || oldStage == stage) return
  const entity = player.opened
  if (!entity) return
  let projectEntity: ProjectEntity | undefined
  if (entity.object_name == "LuaEntity") {
    ;[, projectEntity] = getProjectEntityOfEntity(entity)
  } else if (entity.object_name == "LuaGuiElement") {
    projectEntity = getCurrentlyOpenedModdedGui(player)
    if (projectEntity) {
      player.opened = nil // close gui, possibly updating entity
    }
  }
  if (!projectEntity) return
  if (stage == nil || oldStage.project != stage.project) {
    player.opened = nil
  } else {
    player.opened = projectEntity.getWorldOrPreviewEntity(stage.stageNumber)
  }
})

const StageButtonWidth = 100
const StageButtonHeight = 28

interface EntityStageInfoProps {
  projectEntity: ProjectEntity
  stage: Stage
  anchor?: GuiAnchor
  location?: GuiLocationArray
}
function SmallToolButton(props: ElemProps<"sprite-button">) {
  return <sprite-button style="mini_button" styleMod={{ size: [20, 20] }} {...props} />
}

@RegisterClass("EntityProjectInfo")
class EntityProjectInfo extends Component<EntityStageInfoProps> {
  playerIndex!: PlayerIndex
  stage!: Stage
  actions!: UserActions
  updates!: ProjectUpdates
  entity!: ProjectEntity

  override render(props: EntityStageInfoProps, context: RenderContext): Element {
    this.playerIndex = context.playerIndex
    const { stage, projectEntity: entity } = props
    this.stage = stage
    this.entity = entity

    const currentStageNum = stage.stageNumber
    const project = stage.project

    this.actions = project.actions
    this.updates = project.updates

    const isRollingStock = entity.isRollingStock()

    const firstStageNum = entity.firstStage
    const firstStage = project.getStage(firstStageNum)!
    const stageDiffs = entity.stageDiffs
    const currentStageDiff = stageDiffs && stageDiffs[currentStageNum]

    const lastStage = entity.lastStage

    const isErrorEntity = entity.isInStage(currentStageNum) && entity.getWorldEntity(currentStageNum) == nil

    function StageButton(buttonStage: Stage): Element {
      return (
        <button
          caption={buttonStage.name}
          styleMod={{ width: StageButtonWidth, height: StageButtonHeight }}
          enabled={buttonStage != stage}
          on_gui_click={bind(EntityProjectInfo.teleportToStageAction, buttonStage)}
        />
      )
    }

    return (
      <frame anchor={props.anchor} location={props.location} direction="vertical">
        <TitleBar>
          <label style="frame_title" caption={[L_GuiEntityInfo.Title]} />
          <DraggableSpace />
          <RefreshButton on_gui_click={ibind(this.refresh)} />
        </TitleBar>
        <frame style="inside_shallow_frame_with_padding" direction="vertical">
          <table column_count={2} styleMod={{ vertical_spacing: 0 }}>
            <label caption={[L_GuiEntityInfo.FirstStage]} />
            {StageButton(firstStage)}
            {stageDiffs && <label caption={[L_GuiEntityInfo.StagesWithChanges]} />}
            {stageDiffs &&
              (Object.keys(stageDiffs) as unknown as StageNumber[]).flatMap((stageNum) => {
                const stage = project.getStage(stageNum)!
                return [StageButton(stage), <empty-widget />]
              })}
            {lastStage != nil && <label caption={[L_GuiEntityInfo.LastStage]} />}
            {lastStage != nil && StageButton(project.getStage(lastStage)!)}
          </table>

          {lastStage != nil && (
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.RemoveLastStage]}
              on_gui_click={ibind(this.removeLastStage)}
            />
          )}
          <button
            styleMod={{ horizontally_stretchable: true }}
            caption={[L_GuiEntityInfo.MoveToThisStage]}
            on_gui_click={ibind(this.moveToThisStage)}
            enabled={firstStageNum != currentStageNum}
          />
          {isRollingStock && [
            <line direction="horizontal" />,
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.ResetTrain]}
              on_gui_click={ibind(this.resetTrain)}
            />,
            <button
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.SetTrainLocationHere]}
              on_gui_click={ibind(this.setTrainLocationHere)}
            />,
          ]}
          {currentStageDiff && [<line direction="horizontal" />, this.renderStageDiffSettings(currentStageDiff)]}
          {isErrorEntity && [
            <line direction="horizontal" />,
            <button
              style="red_button"
              styleMod={{ horizontally_stretchable: true }}
              caption={[L_GuiEntityInfo.DeleteEntity]}
              on_gui_click={ibind(this.deleteEntity)}
            />,
          ]}
        </frame>
      </frame>
    )
  }

  private static teleportToStageAction(this: void, stage: Stage, event: OnGuiClickEvent) {
    const player = game.get_player(event.player_index)
    if (player) teleportToStage(player, stage)
  }
  private moveToThisStage() {
    const wasSettingsRemnant = this.entity.isSettingsRemnant
    if (wasSettingsRemnant) {
      this.actions.userRevivedSettingsRemnant(this.entity, this.stage.stageNumber, this.playerIndex)
    } else {
      this.actions.userMoveEntityToStageWithUndo(this.entity, this.stage.stageNumber, this.playerIndex)
    }
    this.rerender(wasSettingsRemnant ?? true)
  }
  private removeLastStage() {
    this.actions.userSetLastStageWithUndo(this.entity, nil, this.playerIndex)
    this.rerender(false)
  }
  private resetTrain() {
    this.updates.resetTrain(this.entity)
  }
  private setTrainLocationHere() {
    this.updates.setTrainLocationToCurrent(this.entity)
  }

  private deleteEntity() {
    this.updates.forceDeleteEntity(this.entity)
  }

  private renderStageDiffSettings(stageDiff: StageDiff<BlueprintEntity>): Element {
    const diffEntries = Object.keys(stageDiff).sort() as Array<keyof BlueprintEntity>
    const nextLowerStageNum = this.entity.prevStageWithDiff(this.stage.stageNumber) ?? this.entity.firstStage
    const nextLowerStageName = this.stage.project.getStage(nextLowerStageNum)!.name.get()
    return (
      <>
        <label caption={[L_GuiEntityInfo.StageDiff]} style="heading_2_label" />
        {diffEntries.map((k) => this.renderPropertyOptions(k, nextLowerStageName))}
        {diffEntries.length > 1 && this.renderPropertyOptions(true, nextLowerStageName)}
      </>
    )
  }
  private renderPropertyOptions(prop: keyof BlueprintEntity | true, nextLowerStageName: LocalisedString): Element {
    const caption: LocalisedString = prop == true ? [L_GuiEntityInfo.AllProps] : prop
    return (
      <flow direction="horizontal">
        <label caption={caption} />
        <HorizontalPusher />
        <SmallToolButton
          sprite="utility/close_black"
          tooltip={[L_GuiEntityInfo.ResetProp]}
          tags={{ prop }}
          on_gui_click={ibind(this.resetProp)}
        />
        <SmallToolButton
          sprite="utility/speed_down"
          tooltip={[L_GuiEntityInfo.ApplyToLowerStage, nextLowerStageName]}
          tags={{ prop }}
          on_gui_click={ibind(this.applyToLowerStage)}
        />
      </flow>
    )
  }

  private resetProp(event: OnGuiClickEvent) {
    const prop = event.element.tags.prop as keyof BlueprintEntity | true
    if (prop == true) {
      this.updates.resetAllProps(this.entity, this.stage.stageNumber)
    } else {
      this.updates.resetProp(this.entity, this.stage.stageNumber, prop as keyof Entity)
    }
    this.rerender(true)
  }
  private applyToLowerStage(event: OnGuiClickEvent) {
    const prop = event.element.tags.prop as keyof BlueprintEntity | true
    if (prop == true) {
      this.updates.moveAllPropsDown(this.entity, this.stage.stageNumber)
    } else {
      this.updates.movePropDown(this.entity, this.stage.stageNumber, prop as keyof Entity)
    }
    this.rerender(false)
  }

  private rerender(reopen: boolean) {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const worldEntity = this.entity.getWorldOrPreviewEntity(this.stage.stageNumber)
    if (!worldEntity) {
      player.opened = nil
      return
    }
    const currentOpened = player.opened
    if (currentOpened == nil) {
      player.opened = worldEntity
      return
    }
    if (currentOpened != worldEntity) return // opened another entity somehow, ignore
    if (reopen) {
      reopenEntity(player)
    } else {
      tryRenderExtraStageInfo(player, worldEntity)
    }
  }

  private refresh() {
    const player = game.get_player(this.playerIndex)
    if (!player) return
    const opened = player.opened
    if (opened && opened.object_name == "LuaEntity") {
      checkForEntityUpdates(opened, this.playerIndex)
      tryRenderExtraStageInfo(player, opened)
    }
  }
}

const EntityProjectInfoName = script.mod_name + ":EntityProjectInfo"
const EntityProjectInfoName2 = script.mod_name + ":EntityProjectInfo2"
function renderEntityStageInfo(player: LuaPlayer, entity: LuaEntity, projectEntity: ProjectEntity, stage: Stage) {
  const guiType = entityTypeToGuiType[entity.type as BuildableEntityType]
  if (guiType == "screen") {
    destroy(player.gui.relative[EntityProjectInfoName])
    destroy(player.gui.relative[EntityProjectInfoName2])
    renderNamed(
      <EntityProjectInfo projectEntity={projectEntity} stage={stage} location={[900, 80]} />,
      player.gui.screen,
      EntityProjectInfoName,
    )
    return
  }
  destroy(player.gui.screen[EntityProjectInfoName])

  let mainGuiType: relative_gui_type
  if (Array.isArray(guiType)) {
    mainGuiType = guiType[0]
  } else {
    mainGuiType = guiType
  }
  const position =
    relative_gui_position[player.mod_settings[Settings.EntityInfoLocation].value as keyof typeof relative_gui_position]

  renderNamed(
    <EntityProjectInfo projectEntity={projectEntity} stage={stage} anchor={{ gui: mainGuiType, position }} />,
    player.gui.relative,
    EntityProjectInfoName,
  )
  if (Array.isArray(guiType)) {
    renderNamed(
      <EntityProjectInfo projectEntity={projectEntity} stage={stage} anchor={{ gui: guiType[1], position }} />,
      player.gui.relative,
      EntityProjectInfoName2,
    )
  }
}
function destroyEntityStageInfo(player: LuaPlayer) {
  const relative = player.gui.relative
  destroy(relative[EntityProjectInfoName])
  destroy(relative[EntityProjectInfoName2])
  destroy(player.gui.screen[EntityProjectInfoName])
}

function tryRenderExtraStageInfo(player: LuaPlayer, entity: LuaEntity): boolean {
  const [stage, projectEntity] = getProjectEntityOfEntity(entity)
  if (!stage) {
    destroyEntityStageInfo(player)
    return false
  }

  renderEntityStageInfo(player, entity, projectEntity, stage)
  return true
}

const Events = ProtectedEvents

declare global {
  interface PlayerData {
    entityToReopen?: LuaEntity
  }
}
declare const storage: StorageWithPlayer

const fakeRerenderTranslationId = script.mod_name + ":rerender-fake-translation"
function reopenEntity(player: LuaPlayer) {
  const opened = player.opened
  if (opened && opened.object_name == "LuaEntity") {
    storage.players[player.index].entityToReopen = opened
    player.opened = nil
    player.request_translation([fakeRerenderTranslationId])
  }
}
Events.on_string_translated((event) => {
  const str = event.localised_string
  if (!Array.isArray(str) || str[0] != fakeRerenderTranslationId) return
  const playerData = storage.players[event.player_index]
  const entity = playerData.entityToReopen
  delete playerData.entityToReopen
  if (entity && entity.valid) {
    const player = game.get_player(event.player_index)!
    player.opened = entity
  }
})

Events.on_gui_opened((e) => {
  if (e.entity) tryRenderExtraStageInfo(game.get_player(e.player_index)!, e.entity)
})

Events.on_gui_closed((e) => {
  if (e.entity) destroyEntityStageInfo(game.get_player(e.player_index)!)
})

Migrations.fromAny(() => {
  for (const [, player] of game.players) {
    const opened = player.opened
    if (opened && opened.object_name == "LuaEntity") {
      tryRenderExtraStageInfo(player, opened)
    }
  }
})

// // testing: which relative_gui corresponds to which entity
// Events.on_init(() => {
//   const player = game.players[1]
//   if (!player) return
//   for (const [name, value] of pairs(relative_gui_type)) {
//     const elem = player.gui.relative.add({
//       type: "frame",
//       caption: name,
//       tooltip: value,
//       anchor: {
//         gui: value,
//         position: relative_gui_position.left,
//       },
//     })!
//     elem.style.height = 300
//   }
// })

const entityTypeToGuiType: Record<
  BuildableEntityType | "rail-remnants",
  relative_gui_type | [relative_gui_type, relative_gui_type] | "screen"
> = {
  "asteroid-collector": relative_gui_type.asteroid_collector_gui,
  accumulator: relative_gui_type.accumulator_gui,
  "ammo-turret": relative_gui_type.turret_gui,
  "arithmetic-combinator": relative_gui_type.arithmetic_combinator_gui,
  "artillery-wagon": relative_gui_type.container_gui,
  "cargo-bay": relative_gui_type.additional_entity_info_gui,
  "cargo-landing-pad": relative_gui_type.cargo_landing_pad_gui,
  "cargo-wagon": relative_gui_type.container_gui,
  "curved-rail-a": relative_gui_type.additional_entity_info_gui,
  "curved-rail-b": relative_gui_type.additional_entity_info_gui,
  "elevated-curved-rail-a": relative_gui_type.additional_entity_info_gui,
  "elevated-curved-rail-b": relative_gui_type.additional_entity_info_gui,
  "elevated-half-diagonal-rail": relative_gui_type.additional_entity_info_gui,
  "half-diagonal-rail": relative_gui_type.additional_entity_info_gui,
  "display-panel": relative_gui_type.display_panel_gui,
  "rail-ramp": relative_gui_type.additional_entity_info_gui,
  "rail-support": relative_gui_type.additional_entity_info_gui,
  "legacy-straight-rail": relative_gui_type.additional_entity_info_gui,
  "legacy-curved-rail": relative_gui_type.additional_entity_info_gui,
  "electric-energy-interface": relative_gui_type.electric_energy_interface_gui,
  "electric-turret": relative_gui_type.turret_gui,
  "fluid-turret": relative_gui_type.turret_gui,
  "fusion-generator": relative_gui_type.additional_entity_info_gui,
  "fusion-reactor": relative_gui_type.entity_with_energy_source_gui,
  "infinity-container": relative_gui_type.container_gui,
  "infinity-pipe": relative_gui_type.infinity_pipe_gui,
  "land-mine": relative_gui_type.additional_entity_info_gui,
  "linked-container": relative_gui_type.linked_container_gui,
  "loader-1x1": relative_gui_type.loader_gui,
  "lightning-attractor": relative_gui_type.additional_entity_info_gui,
  "offshore-pump": relative_gui_type.entity_with_energy_source_gui,
  "pipe-to-ground": relative_gui_type.pipe_gui,
  "player-port": relative_gui_type.additional_entity_info_gui,
  "power-switch": relative_gui_type.power_switch_gui,
  "programmable-speaker": relative_gui_type.programmable_speaker_gui,
  "rail-chain-signal": relative_gui_type.rail_signal_base_gui,
  "rail-signal": relative_gui_type.rail_signal_base_gui,
  "rocket-silo": relative_gui_type.rocket_silo_gui,
  "simple-entity-with-force": relative_gui_type.additional_entity_info_gui,
  "rail-remnants": relative_gui_type.additional_entity_info_gui,
  "simple-entity-with-owner": relative_gui_type.additional_entity_info_gui,
  "solar-panel": relative_gui_type.additional_entity_info_gui,
  "space-platform-hub": relative_gui_type.space_platform_hub_gui,
  thruster: relative_gui_type.additional_entity_info_gui,
  "train-stop": relative_gui_type.train_stop_gui,
  "transport-belt": relative_gui_type.transport_belt_gui,
  "underground-belt": relative_gui_type.additional_entity_info_gui,
  boiler: relative_gui_type.entity_with_energy_source_gui,
  container: relative_gui_type.container_gui,
  furnace: relative_gui_type.furnace_gui,
  gate: relative_gui_type.additional_entity_info_gui,
  generator: relative_gui_type.additional_entity_info_gui,
  inserter: relative_gui_type.inserter_gui,
  pipe: relative_gui_type.pipe_gui,
  radar: relative_gui_type.entity_with_energy_source_gui,
  splitter: relative_gui_type.splitter_gui,
  "lane-splitter": relative_gui_type.splitter_gui,
  "artillery-turret": relative_gui_type.container_gui,
  "assembling-machine": [
    relative_gui_type.assembling_machine_gui,
    relative_gui_type.assembling_machine_select_recipe_gui,
  ],
  "burner-generator": relative_gui_type.entity_with_energy_source_gui,
  "constant-combinator": relative_gui_type.constant_combinator_gui,
  "decider-combinator": relative_gui_type.decider_combinator_gui,
  "selector-combinator": relative_gui_type.selector_combinator_gui,
  "electric-pole": relative_gui_type.electric_network_gui,
  "fluid-wagon": relative_gui_type.additional_entity_info_gui,
  "heat-interface": relative_gui_type.heat_interface_gui,
  "heat-pipe": relative_gui_type.additional_entity_info_gui,
  "linked-belt": relative_gui_type.additional_entity_info_gui,
  "logistic-container": relative_gui_type.container_gui,
  "mining-drill": relative_gui_type.mining_drill_gui,
  "storage-tank": relative_gui_type.storage_tank_gui,
  "straight-rail": relative_gui_type.additional_entity_info_gui,
  beacon: relative_gui_type.beacon_gui,
  lab: relative_gui_type.lab_gui,
  lamp: relative_gui_type.lamp_gui,
  loader: relative_gui_type.loader_gui,
  locomotive: "screen",
  pump: relative_gui_type.pump_gui,
  reactor: relative_gui_type.reactor_gui,
  roboport: relative_gui_type.roboport_gui,
  turret: relative_gui_type.turret_gui,
  wall: relative_gui_type.wall_gui,
}

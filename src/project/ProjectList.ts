import { nil } from "factorio:runtime"
import { remove_from_list } from "util"
import { globalEvent } from "../lib"
import { ProjectId, UserProject } from "./ProjectDef"

declare const storage: {
  projects: UserProject[]
}

export const projectCreated = globalEvent<[UserProject]>()
export const projectDeleted = globalEvent<[UserProject]>()
export const projectsReordered = globalEvent<[UserProject, UserProject]>()

export function getAllProjects(): readonly UserProject[] {
  return storage.projects
}

export function getProjectCount(): number {
  return storage.projects.length
}

export function getProjectById(id: ProjectId): UserProject | nil {
  for (const [, project] of pairs(storage.projects as Record<number, UserProject>)) {
    if (project.id == id) return project
  }
  return nil
}

export function addProject(project: UserProject): void {
  storage.projects.push(project)
  projectCreated.raise(project)
}

export function removeProject(project: UserProject): void {
  remove_from_list(storage.projects, project)
  projectDeleted.raise(project)
}

function swapProjects(index1: number, index2: number): void {
  const projects = storage.projects
  const temp = projects[index1]
  projects[index1] = projects[index2]
  projects[index2] = temp
  projectsReordered.raise(projects[index1], projects[index2])
}

export function moveProjectUp(project: UserProject): boolean {
  const index = storage.projects.indexOf(project as any)
  if (index <= 0) return false
  swapProjects(index - 1, index)
  return true
}

export function moveProjectDown(project: UserProject): boolean {
  const index = storage.projects.indexOf(project as any)
  if (index < 0 || index >= storage.projects.length - 1) return false
  swapProjects(index, index + 1)
  return true
}

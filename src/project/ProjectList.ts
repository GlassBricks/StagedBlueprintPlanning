import { remove_from_list } from "util"
import { globalEvent } from "../lib"
import { ProjectId, Stage, Project } from "./Project"

declare const storage: {
  projects: Project[]
}

export const projectCreated = globalEvent<[Project]>()
export const projectDeleted = globalEvent<[Project]>()
export const projectsReordered = globalEvent<[Project, Project]>()
export const stageDeleted = globalEvent<[project: Project, stage: Stage]>()

export function getAllProjects(): readonly Project[] {
  return storage.projects
}

export function getProjectCount(): number {
  return storage.projects.length
}

export function getProjectById(id: ProjectId): Project | nil {
  for (const [, project] of pairs(storage.projects as Record<number, Project>)) {
    if (project.id == id) return project
  }
  return nil
}

export function addProject(project: Project): void {
  storage.projects.push(project)
  projectCreated.raise(project)
}

export function removeProject(project: Project): void {
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

export function moveProjectUp(project: Project): boolean {
  const index = storage.projects.indexOf(project as any)
  if (index <= 0) return false
  swapProjects(index - 1, index)
  return true
}

export function moveProjectDown(project: Project): boolean {
  const index = storage.projects.indexOf(project as any)
  if (index < 0 || index >= storage.projects.length - 1) return false
  swapProjects(index, index + 1)
  return true
}

import { createContext, useContext } from 'react'
import type { ScheduleResult } from '../lib/scheduling'
import type {
  CalendarConfig,
  Dependency,
  ProjectData,
  Resource,
  Task,
} from '../types'

export type TaskInput = Omit<Task, 'id'>
export type DependencyInput = Omit<Dependency, 'id'>
export type ResourceInput = Omit<Resource, 'id'>

export interface ProjectApi {
  data: ProjectData
  schedule: ScheduleResult
  addTask: (input: TaskInput) => string
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  addDependency: (input: DependencyInput) => void
  updateDependency: (id: string, patch: Partial<Dependency>) => void
  deleteDependency: (id: string) => void
  addResource: (input: ResourceInput) => void
  updateResource: (id: string, patch: Partial<Resource>) => void
  deleteResource: (id: string) => void
  updateCalendar: (patch: Partial<CalendarConfig>) => void
  renameProject: (name: string) => void
  resetToSeed: () => void
  importData: (data: ProjectData) => void
}

export const ProjectContext = createContext<ProjectApi | null>(null)

export function useProject(): ProjectApi {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject harus dipakai di dalam <ProjectProvider>')
  return ctx
}

import { useCallback, useState } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { TaskForm } from './components/TaskForm'
import { AnalysisPage } from './pages/AnalysisPage'
import { CalendarPage } from './pages/CalendarPage'
import { Dashboard } from './pages/Dashboard'
import { GanttPage } from './pages/GanttPage'
import { TasksPage } from './pages/TasksPage'
import { TeamPage } from './pages/TeamPage'
import { ProjectProvider } from './store/ProjectProvider'
import { useProject } from './store/projectContext'
import { UiProvider } from './store/UiProvider'
import type { Task, ViewKey } from './types'

interface FormState {
  open: boolean
  task: Task | null
  parentId: string | null
}

function Shell() {
  const { data } = useProject()
  const [view, setView] = useState<ViewKey>('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({ open: false, task: null, parentId: null })

  const navigate = useCallback((next: ViewKey) => {
    setView(next)
    setNavOpen(false)
  }, [])

  const openForm = useCallback((task: Task | null, parentId: string | null = null) => {
    setForm({ open: true, task, parentId })
  }, [])

  const closeForm = useCallback(() => {
    setForm({ open: false, task: null, parentId: null })
  }, [])

  const rootCount = data.tasks.filter((t) => t.parentId === null).length

  return (
    <div className={`app ${collapsed ? 'is-collapsed' : ''} ${navOpen ? 'nav-open' : ''}`}>
      <Sidebar
        view={view}
        onNavigate={navigate}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        badges={{
          tasks: data.tasks.length,
          team: data.resources.length,
          gantt: rootCount,
        }}
      />

      <div className="shell">
        <Header onToggleNav={() => setNavOpen((o) => !o)} onQuickAdd={() => openForm(null)} />

        <main className="main" key={view}>
          {view === 'dashboard' && <Dashboard onNavigate={navigate} />}
          {view === 'gantt' && (
            <GanttPage
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={(t) => openForm(t)}
            />
          )}
          {view === 'tasks' && (
            <TasksPage
              onOpenForm={openForm}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {view === 'team' && <TeamPage />}
          {view === 'calendar' && <CalendarPage />}
          {view === 'analysis' && <AnalysisPage />}
        </main>
      </div>

      {form.open && (
        <TaskForm
          task={form.task}
          defaultParentId={form.parentId}
          onClose={closeForm}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ProjectProvider>
      <UiProvider>
        <Shell />
      </UiProvider>
    </ProjectProvider>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentAction,
  type AgentDefinition,
  type InventoryItem,
  type MenuItem,
  type Order,
  type Staff,
  type Supplier,
  approveAction,
  fetchHealth,
  listActions,
  listAgentDefinitions,
  listInventoryItems,
  listMenuItems,
  listOrders,
  listStaff,
  listSuppliers,
  rejectAction,
  triggerRun,
} from '../api/client'
import { ActionCenter } from './ActionCenter'
import { AgentTeam } from './AgentTeam'
import { Drawer } from './Drawer'
import { ForecastPanel } from './ForecastPanel'
import { MetricsRow } from './MetricsRow'
import { NewTaskModal } from './NewTaskModal'
import { Sidebar } from './Sidebar'
import { Toast, type ToastState } from './Toast'
import { Topbar } from './Topbar'

export function DashboardPage() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [agents, setAgents] = useState<AgentDefinition[]>([])
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [orders, setOrders] = useState<Order[]>([])

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [drawerAction, setDrawerAction] = useState<AgentAction | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalDefaultAgent, setModalDefaultAgent] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [busyActionId, setBusyActionId] = useState<string | null>(null)
  const [bossBusy, setBossBusy] = useState(false)
  const [bossSummary, setBossSummary] = useState<string | null>(null)
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const [scenarioResult, setScenarioResult] = useState<string | null>(null)

  const showToast = useCallback((title: string, subtitle?: string) => {
    setToast({ title, subtitle })
    setTimeout(() => setToast(null), 2800)
  }, [])

  const refreshActions = useCallback(() => {
    listActions('pending').then(setPendingActions).catch(() => {})
  }, [])

  useEffect(() => {
    fetchHealth()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'))

    listAgentDefinitions().then(setAgents).catch(() => {})
    refreshActions()
    listInventoryItems().then(setInventoryItems).catch(() => {})
    listSuppliers().then(setSuppliers).catch(() => {})
    listStaff().then(setStaff).catch(() => {})
    listMenuItems().then(setMenuItems).catch(() => {})
    listOrders().then(setOrders).catch(() => {})
  }, [refreshActions])

  const boss = useMemo(() => agents.find((a) => a.role === 'boss'), [agents])
  const subagents = useMemo(() => agents.filter((a) => a.role === 'subagent'), [agents])
  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const handleApprove = async (action: AgentAction) => {
    setBusyActionId(action.id)
    try {
      await approveAction(action.id)
      showToast('Action approved', 'Your agents are handling the next steps.')
      refreshActions()
      setDrawerAction(null)
    } catch (err) {
      showToast('Approval failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusyActionId(null)
    }
  }

  const handleReject = async (action: AgentAction) => {
    setBusyActionId(action.id)
    try {
      await rejectAction(action.id)
      showToast('Action rejected')
      refreshActions()
      setDrawerAction(null)
    } catch (err) {
      showToast('Reject failed', err instanceof Error ? err.message : String(err))
    } finally {
      setBusyActionId(null)
    }
  }

  const handleCreateTask = async (agentKey: string, task: string) => {
    const isBoss = agentKey === boss?.key
    if (isBoss) setBossBusy(true)
    try {
      const run = await triggerRun(agentKey, task)
      setModalOpen(false)
      if (isBoss) {
        setBossSummary(run.output_summary ?? run.error ?? 'Run finished with no summary.')
      }
      showToast(
        run.status === 'succeeded' ? 'Task complete' : 'Task finished with an issue',
        run.output_summary ?? run.error ?? 'The assigned agent has finished.',
      )
      refreshActions()
    } finally {
      if (isBoss) setBossBusy(false)
    }
  }

  const handleRunScenario = async () => {
    setScenarioBusy(true)
    try {
      const run = await triggerRun('profit', "Give me tonight's profit forecast and any optimization opportunities.")
      setScenarioResult(run.output_summary ?? run.error ?? 'No result returned.')
      showToast('Scenario complete', run.status === 'succeeded' ? 'The Profit Agent has a new forecast.' : 'The run finished with an error.')
    } catch (err) {
      showToast('Scenario failed', err instanceof Error ? err.message : String(err))
    } finally {
      setScenarioBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} apiStatus={apiStatus} agentCount={agents.length} pendingCount={pendingActions.length} />

      <main>
        <Topbar
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          onNewTask={() => {
            setModalDefaultAgent(null)
            setModalOpen(true)
          }}
        />

        <div className="content" id="overview">
          <section className="welcome-row">
            <div>
              <p className="kicker">RESTAURANT OVERVIEW</p>
              <h1>Good morning, Alex.</h1>
              <p>
                {apiStatus === 'ok'
                  ? "Your agents are on it. Here's what needs your attention today."
                  : apiStatus === 'checking'
                    ? 'Connecting to the backend…'
                    : 'Backend unreachable — check the API server is running.'}
              </p>
            </div>
          </section>

          <MetricsRow pendingCount={pendingActions.length} />

          <AgentTeam
            boss={boss}
            subagents={subagents}
            pendingActions={pendingActions}
            inventoryItems={inventoryItems}
            suppliers={suppliers}
            staff={staff}
            menuItems={menuItems}
            orders={orders}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onReleaseBoss={() => {
              setModalDefaultAgent(boss?.key ?? null)
              setModalOpen(true)
            }}
            bossBusy={bossBusy}
            bossSummary={bossSummary}
          />

          <section className="lower-grid">
            <ActionCenter
              actions={pendingActions}
              agentsById={agentsById}
              onApprove={handleApprove}
              onReject={handleReject}
              onViewDetails={setDrawerAction}
              busyActionId={busyActionId}
            />
            <ForecastPanel onRunScenario={handleRunScenario} scenarioBusy={scenarioBusy} scenarioResult={scenarioResult} />
          </section>
        </div>
      </main>

      <Drawer
        action={drawerAction}
        agentsById={agentsById}
        onClose={() => setDrawerAction(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        busy={busyActionId === drawerAction?.id}
      />

      <NewTaskModal
        open={modalOpen}
        agents={agents}
        defaultAgentKey={modalDefaultAgent}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreateTask}
      />

      <Toast toast={toast} />
    </div>
  )
}

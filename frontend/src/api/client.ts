const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  return res
}

async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `${path} failed: ${res.status}`)
  }
  return res.json()
}

export type AgentDefinition = {
  id: string
  key: string
  name: string
  description: string
  role: 'boss' | 'subagent'
  model: string
  tool_allowlist: string[]
  schedule_cron: string | null
  enabled: boolean
}

export type AgentRun = {
  id: string
  agent_definition_id: string
  parent_run_id: string | null
  depth: number
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  trigger_type: 'manual' | 'scheduled' | 'delegated'
  input: string | null
  output_summary: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export type AgentAction = {
  id: string
  run_id: string
  agent_definition_id: string
  action_type: string
  payload: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  decided_at: string | null
}

export type InventoryItem = {
  id: string
  name: string
  unit: string
  quantity_on_hand: number
  reorder_threshold: number
  reorder_qty: number
  unit_cost: number
  supplier_id: string | null
}

export type Supplier = { id: string; name: string; contact_info: string | null; lead_time_days: number }
export type Staff = { id: string; name: string; role: string; email: string | null }
export type MenuItem = { id: string; name: string; category: string; price: number; cost: number; is_available: boolean }
export type Order = { id: string; status: string; channel: string; total: number; created_at: string }

export const fetchHealth = () => apiJson<{ status: string }>('/health')

export const listAgentDefinitions = () => apiJson<AgentDefinition[]>('/api/v1/agents/definitions')

export const listRuns = (agentKey?: string) =>
  apiJson<AgentRun[]>(`/api/v1/agents/runs${agentKey ? `?agent_key=${agentKey}` : ''}`)

export const triggerRun = (agentKey: string, input: string) =>
  apiJson<AgentRun>('/api/v1/agents/runs', {
    method: 'POST',
    body: JSON.stringify({ agent_key: agentKey, input }),
  })

export const listActions = (status?: string) =>
  apiJson<AgentAction[]>(`/api/v1/agents/actions${status ? `?status=${status}` : ''}`)

export const approveAction = (id: string) =>
  apiJson<AgentAction>(`/api/v1/agents/actions/${id}/approve`, { method: 'POST' })

export const rejectAction = (id: string) =>
  apiJson<AgentAction>(`/api/v1/agents/actions/${id}/reject`, { method: 'POST' })

export const listInventoryItems = () => apiJson<InventoryItem[]>('/api/v1/restaurant/inventory-items')
export const listSuppliers = () => apiJson<Supplier[]>('/api/v1/restaurant/suppliers')
export const listStaff = () => apiJson<Staff[]>('/api/v1/restaurant/staff')
export const listMenuItems = () => apiJson<MenuItem[]>('/api/v1/restaurant/menu-items')
export const listOrders = () => apiJson<Order[]>('/api/v1/restaurant/orders')

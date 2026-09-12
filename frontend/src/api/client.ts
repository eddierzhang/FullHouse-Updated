const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  return res
}

/** For 204 responses, which have no body for `res.json()` to parse. */
async function apiVoid(path: string, options?: RequestInit): Promise<void> {
  const res = await apiFetch(path, options)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `${path} failed: ${res.status}`)
  }
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
  applied_result?: string | null
  /** False when no applier handles this type at all. */
  appliable?: boolean
  /** Fields the proposal left for the operator to supply. */
  needs_input?: string[]
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
export type StaffInput = { name: string; role: string; email?: string | null }
export type Shift = {
  id: number
  staff_id: string
  date: string
  start_time: string
  end_time: string
  role: string
}
export type ShiftInput = {
  staff_id: string
  date: string
  start_time: string
  end_time: string
  role: string
}
export type MenuItem = { id: string; name: string; category: string; price: number; cost: number; is_available: boolean }
export type MenuItemInput = {
  name: string
  category: string
  price: number
  cost: number
  description?: string | null
  is_available?: boolean
}
export type MenuPerformance = {
  id: string
  name: string
  category: string
  price: number
  cost: number
  description: string | null
  is_available: boolean
  units_sold: number
  revenue: number
  margin: number
  margin_pct: number
  profit: number
}
export type SupplierInput = {
  name: string
  contact_info?: string | null
  lead_time_days?: number
}
export type SupplyChain = {
  total_stock_value: number
  supplier_count: number
  item_count: number
  unassigned_item_count: number
  unassigned_stock_value: number
  low_stock_count: number
  restock_cost: number
  longest_lead_days: number
  suppliers: {
    id: string
    name: string
    contact_info: string | null
    lead_time_days: number
    item_count: number
    stock_value: number
    low_stock_count: number
    restock_cost: number
    share_pct: number
  }[]
  low_stock: {
    id: string
    name: string
    unit: string
    quantity_on_hand: number
    reorder_threshold: number
    reorder_qty: number
    unit_cost: number
    supplier_id: string | null
    supplier_name: string | null
    lead_time_days: number | null
    restock_cost: number
  }[]
}
export type ProfitSummary = {
  days: number
  start: string
  end: string
  revenue: number
  cogs: number
  gross_profit: number
  margin_pct: number
  orders: number
  average_order_value: number
  inventory_value: number
  daily: { date: string; revenue: number; cogs: number; profit: number; orders: number }[]
  by_category: { category: string; revenue: number; profit: number; units: number }[]
  by_channel: { channel: string; revenue: number; orders: number }[]
}
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

export const approveAction = (id: string, overrides?: Record<string, unknown>) =>
  apiJson<AgentAction>(`/api/v1/agents/actions/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ overrides: overrides ?? {} }),
  })

export const rejectAction = (id: string) =>
  apiJson<AgentAction>(`/api/v1/agents/actions/${id}/reject`, { method: 'POST' })

export const listInventoryItems = () => apiJson<InventoryItem[]>('/api/v1/restaurant/inventory-items')
export const listSuppliers = () => apiJson<Supplier[]>('/api/v1/restaurant/suppliers')
export const listStaff = () => apiJson<Staff[]>('/api/v1/restaurant/staff')
export const listMenuItems = () => apiJson<MenuItem[]>('/api/v1/restaurant/menu-items')
export const listOrders = () => apiJson<Order[]>('/api/v1/restaurant/orders')

export const listShifts = () => apiJson<Shift[]>('/api/v1/restaurant/shifts')

export const createStaff = (input: StaffInput) =>
  apiJson<Staff>('/api/v1/restaurant/staff', { method: 'POST', body: JSON.stringify(input) })

export const updateStaff = (id: string, patch: Partial<StaffInput>) =>
  apiJson<Staff>(`/api/v1/restaurant/staff/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteStaff = (id: string) =>
  apiVoid(`/api/v1/restaurant/staff/${id}`, { method: 'DELETE' })

export const createShift = (input: ShiftInput) =>
  apiJson<Shift>('/api/v1/restaurant/shifts', { method: 'POST', body: JSON.stringify(input) })

export const updateShift = (id: number, patch: Partial<ShiftInput>) =>
  apiJson<Shift>(`/api/v1/restaurant/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteShift = (id: number) =>
  apiVoid(`/api/v1/restaurant/shifts/${id}`, { method: 'DELETE' })

export const listMenuPerformance = () =>
  apiJson<MenuPerformance[]>('/api/v1/restaurant/menu-performance')

export const createMenuItem = (input: MenuItemInput) =>
  apiJson<MenuItem>('/api/v1/restaurant/menu-items', { method: 'POST', body: JSON.stringify(input) })

export const updateMenuItem = (id: string, patch: Partial<MenuItemInput>) =>
  apiJson<MenuItem>(`/api/v1/restaurant/menu-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const deleteMenuItem = (id: string) =>
  apiVoid(`/api/v1/restaurant/menu-items/${id}`, { method: 'DELETE' })

export const fetchProfitSummary = (days = 30) =>
  apiJson<ProfitSummary>(`/api/v1/restaurant/profit-summary?days=${days}`)

export const fetchSupplyChain = () => apiJson<SupplyChain>('/api/v1/restaurant/supply-chain')

export const createSupplier = (input: SupplierInput) =>
  apiJson<Supplier>('/api/v1/restaurant/suppliers', { method: 'POST', body: JSON.stringify(input) })

export const updateSupplier = (id: string, patch: Partial<SupplierInput>) =>
  apiJson<Supplier>(`/api/v1/restaurant/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

export const deleteSupplier = (id: string) =>
  apiVoid(`/api/v1/restaurant/suppliers/${id}`, { method: 'DELETE' })

export const updateInventoryItem = (
  id: string,
  patch: Partial<{
    name: string
    unit: string
    quantity_on_hand: number
    reorder_threshold: number
    reorder_qty: number
    unit_cost: number
    supplier_id: string | null
  }>,
) =>
  apiJson<InventoryItem>(`/api/v1/restaurant/inventory-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

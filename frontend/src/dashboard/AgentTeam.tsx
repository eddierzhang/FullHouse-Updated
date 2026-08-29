import type { AgentAction, AgentDefinition, InventoryItem, MenuItem, Order, Staff, Supplier } from '../api/client'
import { AGENT_META } from './agentMeta'

type Props = {
  boss: AgentDefinition | undefined
  subagents: AgentDefinition[]
  pendingActions: AgentAction[]
  inventoryItems: InventoryItem[]
  suppliers: Supplier[]
  staff: Staff[]
  menuItems: MenuItem[]
  orders: Order[]
  selectedKey: string | null
  onSelect: (key: string) => void
  onReleaseBoss: () => void
  bossBusy: boolean
  bossSummary: string | null
}

function statsFor(
  key: string,
  { inventoryItems, suppliers, staff, menuItems, orders, pendingActions }: Props,
): { top: [string, string]; bottom: [string, string] } {
  const pendingFor = (type: string) => pendingActions.filter((a) => a.action_type === type).length

  switch (key) {
    case 'inventory': {
      const total = inventoryItems.length
      const low = inventoryItems.filter((i) => i.quantity_on_hand <= i.reorder_threshold).length
      const pct = total ? Math.round(((total - low) / total) * 100) : 0
      return { top: [`${pct}%`, 'items in stock'], bottom: [String(low), 'low stock'] }
    }
    case 'supply_chain':
      return { top: [String(suppliers.length), 'suppliers'], bottom: [String(pendingFor('purchase_order')), 'pending orders'] }
    case 'employee_management':
      return { top: [String(staff.length), 'staff members'], bottom: [String(pendingFor('shift_change')), 'pending changes'] }
    case 'profit': {
      const revenue = orders.reduce((sum, o) => sum + o.total, 0)
      return { top: [`$${revenue.toFixed(0)}`, 'total revenue'], bottom: [String(menuItems.length), 'menu items'] }
    }
    case 'marketing':
      return { top: [String(menuItems.length), 'menu items'], bottom: [String(pendingFor('menu_change')), 'proposals'] }
    default:
      return { top: ['—', ''], bottom: ['—', ''] }
  }
}

export function AgentTeam(props: Props) {
  const { boss, subagents, pendingActions, selectedKey, onSelect, onReleaseBoss, bossBusy, bossSummary } = props

  return (
    <>
      {boss && (
        <section className="boss-banner">
          <div className="boss-banner-copy">
            <div className="boss-avatar">B</div>
            <div>
              <h2>{boss.name}</h2>
              <p>{boss.description}</p>
              {bossSummary && <div className="boss-summary">{bossSummary}</div>}
            </div>
          </div>
          <button className="primary-button" onClick={onReleaseBoss} disabled={bossBusy}>
            {bossBusy ? 'Running…' : 'Release Boss'}
          </button>
        </section>
      )}

      <section className="section-heading" id="agents">
        <div>
          <h2>Your agent team</h2>
          <p>Specialists working together across your restaurant.</p>
        </div>
      </section>

      <section className="agent-grid">
        {subagents.map((agent) => {
          const meta = AGENT_META[agent.key] ?? { letter: agent.name[0], avatarClass: 'people', pulseClass: 'pulse' }
          const { top, bottom } = statsFor(agent.key, props)
          const agentPending = pendingActions.filter((a) => a.agent_definition_id === agent.id)
          const latest = agentPending[0]

          return (
            <button
              key={agent.id}
              className={`agent-card${selectedKey === agent.key ? ' active-agent' : ''}`}
              onClick={() => onSelect(agent.key)}
            >
              <div className="agent-card-top">
                <div className={`agent-avatar ${meta.avatarClass}`}>
                  {meta.letter}
                  <span className="agent-status"></span>
                </div>
                <span className="agent-pill neutral">Specialist</span>
              </div>
              <h3>{agent.name}</h3>
              <p>{agent.description}</p>
              <div className="agent-stats">
                <div>
                  <strong>{top[0]}</strong>
                  <small>{top[1]}</small>
                </div>
                <div>
                  <strong>{bottom[0]}</strong>
                  <small>{bottom[1]}</small>
                </div>
              </div>
              <div className={`agent-activity${latest ? ' attention' : ''}`}>
                <span className={meta.pulseClass}></span>
                <span>{latest ? `Pending: ${latest.action_type.replace('_', ' ')}` : 'All caught up'}</span>
                <small>{agentPending.length > 0 ? `${agentPending.length} pending` : ''}</small>
              </div>
            </button>
          )
        })}
      </section>
    </>
  )
}

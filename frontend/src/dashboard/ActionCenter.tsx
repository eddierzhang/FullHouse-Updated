import { useState } from 'react'
import type { AgentAction, AgentDefinition } from '../api/client'
import { ACTION_TYPE_META, actionTitle, actionDetail } from './agentMeta'

type Props = {
  actions: AgentAction[]
  agentsById: Map<string, AgentDefinition>
  onApprove: (action: AgentAction, overrides?: Record<string, unknown>) => void
  onReject: (action: AgentAction) => void
  onViewDetails: (action: AgentAction) => void
  busyActionId: string | null
}

export function ActionCenter({ actions, agentsById, onApprove, onReject, onViewDetails, busyActionId }: Props) {
  const [filter, setFilter] = useState<'all' | 'urgent'>('all')
  /** Operator-supplied values, keyed by action id, for proposals that left a blank. */
  const [inputs, setInputs] = useState<Record<string, string>>({})

  const visible = actions.filter((a) => {
    if (filter === 'all') return true
    return ACTION_TYPE_META[a.action_type]?.tagClass === 'urgent'
  })

  return (
    <div className="panel action-panel" id="tasks">
      <div className="panel-heading">
        <div>
          <h2>Action center</h2>
          <p>Review recommendations from your agents.</p>
        </div>
        <div className="tabs">
          <button className={`tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            All <span>{actions.length}</span>
          </button>
          <button className={`tab${filter === 'urgent' ? ' active' : ''}`} onClick={() => setFilter('urgent')}>
            Urgent
          </button>
        </div>
      </div>

      <div className="task-list">
        {visible.length === 0 && <p className="empty-state">No pending recommendations right now.</p>}
        {visible.map((action) => {
          const meta = ACTION_TYPE_META[action.action_type] ?? {
            tag: 'Review',
            tagClass: 'review',
            symbol: '•',
            bgClass: 'blue-bg',
          }
          const agent = agentsById.get(action.agent_definition_id)
          const busy = busyActionId === action.id
          // A proposal can describe an intent it has no number for -- a BOGO
          // carries no price. Ask here rather than failing after Approve.
          const needsPrice = (action.needs_input ?? []).includes('new_price')
          const blocked = action.appliable === false
          const typed = inputs[action.id] ?? ''
          const priceReady = !needsPrice || (typed.trim() !== '' && Number(typed) >= 0)

          return (
            <article className="task-row" key={action.id} data-priority={meta.tagClass === 'urgent' ? 'urgent' : 'normal'}>
              <div className={`task-symbol ${meta.bgClass}`}>{meta.symbol}</div>
              <div className="task-copy">
                <div>
                  <span className={`tag ${meta.tagClass}`}>{meta.tag}</span>
                  <span className="task-agent">{agent?.name ?? 'Agent'}</span>
                </div>
                <h4>{actionTitle(action.action_type, action.payload)}</h4>
                <p>{actionDetail(action.action_type, action.payload)}</p>
                {blocked && (
                  <p className="task-blocked">
                    Nothing can carry this out yet — reject it, or add support for{' '}
                    <code>{action.action_type}</code>.
                  </p>
                )}
                {needsPrice && !blocked && (
                  <p className="task-blocked">
                    This proposal names no price. Enter one to approve it.
                  </p>
                )}
              </div>
              <div className="task-actions">
                {needsPrice && !blocked && (
                  <input
                    className="task-input"
                    inputMode="decimal"
                    placeholder="New price"
                    value={typed}
                    aria-label="New price for this promotion"
                    onChange={(e) => setInputs({ ...inputs, [action.id]: e.target.value })}
                  />
                )}
                <button className="secondary-button details-button" onClick={() => onViewDetails(action)}>
                  View details
                </button>
                <button className="reject-button" disabled={busy} onClick={() => onReject(action)}>
                  Reject
                </button>
                <button
                  className="approve-button"
                  disabled={busy || blocked || !priceReady}
                  title={
                    blocked
                      ? 'Nothing in the system can carry this out yet'
                      : needsPrice && !priceReady
                        ? 'Enter the promotional price first'
                        : undefined
                  }
                  onClick={() =>
                    onApprove(action, needsPrice ? { new_price: Number(typed) } : undefined)
                  }
                >
                  {busy ? 'Working…' : 'Approve'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

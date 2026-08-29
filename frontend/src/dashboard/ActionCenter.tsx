import { useState } from 'react'
import type { AgentAction, AgentDefinition } from '../api/client'
import { ACTION_TYPE_META, actionTitle, actionDetail } from './agentMeta'

type Props = {
  actions: AgentAction[]
  agentsById: Map<string, AgentDefinition>
  onApprove: (action: AgentAction) => void
  onReject: (action: AgentAction) => void
  onViewDetails: (action: AgentAction) => void
  busyActionId: string | null
}

export function ActionCenter({ actions, agentsById, onApprove, onReject, onViewDetails, busyActionId }: Props) {
  const [filter, setFilter] = useState<'all' | 'urgent'>('all')

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
              </div>
              <div className="task-actions">
                <button className="secondary-button details-button" onClick={() => onViewDetails(action)}>
                  View details
                </button>
                <button className="reject-button" disabled={busy} onClick={() => onReject(action)}>
                  Reject
                </button>
                <button className="approve-button" disabled={busy} onClick={() => onApprove(action)}>
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

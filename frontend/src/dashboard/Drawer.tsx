import type { AgentAction, AgentDefinition } from '../api/client'
import { actionDetail, actionTitle } from './agentMeta'

type Props = {
  action: AgentAction | null
  agentsById: Map<string, AgentDefinition>
  onClose: () => void
  onApprove: (action: AgentAction) => void
  onReject: (action: AgentAction) => void
  busy: boolean
}

export function Drawer({ action, agentsById, onClose, onApprove, onReject, busy }: Props) {
  const agent = action ? agentsById.get(action.agent_definition_id) : undefined

  return (
    <>
      <div className={`drawer-overlay${action ? ' open' : ''}`} onClick={onClose}></div>
      <aside className={`drawer${action ? ' open' : ''}`} aria-hidden={!action}>
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {action && (
          <>
            <span className="tag review">{agent?.name ?? 'Agent'} recommendation</span>
            <h2>{actionTitle(action.action_type, action.payload)}</h2>
            <p>{actionDetail(action.action_type, action.payload)}</p>
            <div className="drawer-block">
              <small>PROPOSED BY</small>
              <strong>{agent?.name ?? 'Agent'}</strong>
              <p>Status: {action.status} · Submitted {new Date(action.created_at).toLocaleString()}</p>
            </div>
            <div className="drawer-block">
              <small>DETAILS</small>
              <pre style={{ fontSize: 10, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>
                {JSON.stringify(action.payload, null, 2)}
              </pre>
            </div>
            {action.status === 'pending' && (
              <div className="drawer-actions">
                <button className="reject-button" disabled={busy} onClick={() => onReject(action)}>
                  Reject
                </button>
                <button className="approve-button" disabled={busy} onClick={() => onApprove(action)}>
                  {busy ? 'Working…' : 'Approve recommendation'}
                </button>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  )
}

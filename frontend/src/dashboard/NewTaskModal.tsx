import { useEffect, useState } from 'react'
import type { AgentDefinition } from '../api/client'

type Props = {
  open: boolean
  agents: AgentDefinition[]
  defaultAgentKey: string | null
  onClose: () => void
  onSubmit: (agentKey: string, task: string) => Promise<void>
}

export function NewTaskModal({ open, agents, defaultAgentKey, onClose, onSubmit }: Props) {
  const [task, setTask] = useState('')
  const [agentKey, setAgentKey] = useState(defaultAgentKey ?? agents[0]?.key ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAgentKey(defaultAgentKey ?? agents[0]?.key ?? '')
      setTask('')
      setError(null)
    }
  }, [open, defaultAgentKey, agents])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(agentKey, task)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-heading">
          <div>
            <p className="kicker">DELEGATE WORK</p>
            <h2>Create an agent task</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label>
          Task description
          <textarea
            required
            placeholder="e.g. Compare produce vendor pricing for next week"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
        </label>
        <label>
          Assign to
          <select value={agentKey} onChange={(e) => setAgentKey(e.target.value)}>
            {agents.map((a) => (
              <option key={a.key} value={a.key}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-button" disabled={submitting || !task.trim()}>
            {submitting ? 'Running…' : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type AgentDefinition,
  type AgentRun,
  type RunEvent,
  cancelRun,
  getRun,
  listRuns,
  runStreamUrl,
} from '../api/client'

type Props = {
  agents: AgentDefinition[]
  showToast: (title: string, subtitle?: string) => void
  /** Run to open on arrival, set when a task is launched from the modal. */
  focusRunId?: string | null
}

const TERMINAL = '__end__'
const LIVE_STATUSES = ['queued', 'running']

const STATUS_TAG: Record<string, string> = {
  succeeded: 'opportunity',
  running: 'review',
  queued: 'review',
  failed: 'urgent',
  cancelled: 'urgent',
}

function duration(run: AgentRun): string {
  if (!run.started_at) return '—'
  const end = run.finished_at ? new Date(run.finished_at) : new Date()
  const seconds = Math.max(0, (end.getTime() - new Date(run.started_at).getTime()) / 1000)
  return seconds < 60 ? `${seconds.toFixed(0)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`
}

function eventLine(event: { type: string; payload: Record<string, unknown> }): string {
  const payload = event.payload ?? {}
  switch (event.type) {
    case 'tool_call':
      return `${payload.tool}(${JSON.stringify(payload.input ?? {})})`
    case 'tool_result':
      return `${payload.tool} → ${String(payload.result ?? '')}`
    case 'delegation':
      return `delegated to ${payload.agent_name}: ${payload.task}`
    case 'status_change':
      return `status → ${payload.status}${payload.error ? `: ${payload.error}` : ''}`
    default:
      return String(payload.text ?? JSON.stringify(payload))
  }
}

export function RunsPage({ agents, showToast, focusRunId }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(focusRunId ?? null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [detail, setDetail] = useState<AgentRun | null>(null)
  const [live, setLive] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  const agentsById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents])

  const refreshRuns = useCallback(() => {
    listRuns().then(setRuns).catch(() => {})
  }, [])

  useEffect(refreshRuns, [refreshRuns])

  useEffect(() => {
    if (focusRunId) setSelectedId(focusRunId)
  }, [focusRunId])

  // One EventSource per selected run. It replays the run's history before
  // going live, so opening a finished run shows everything it did.
  useEffect(() => {
    if (!selectedId) return
    setEvents([])
    setLive(true)

    getRun(selectedId).then(setDetail).catch(() => {})

    const source = new EventSource(runStreamUrl(selectedId))
    source.onmessage = (message) => {
      const event: RunEvent = JSON.parse(message.data)
      if (event.type === TERMINAL) {
        setLive(false)
        source.close()
        getRun(selectedId).then(setDetail).catch(() => {})
        refreshRuns()
        return
      }
      setEvents((previous) => [...previous, event])
      if (event.type === 'status_change') {
        getRun(selectedId).then(setDetail).catch(() => {})
        refreshRuns()
      }
    }
    source.onerror = () => {
      setLive(false)
      source.close()
    }

    return () => {
      source.close()
      setLive(false)
    }
  }, [selectedId, refreshRuns])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [events])

  const handleCancel = async () => {
    if (!selectedId) return
    try {
      await cancelRun(selectedId)
      showToast('Cancelling', 'The run stops at its next checkpoint.')
    } catch (err) {
      showToast('Could not cancel', err instanceof Error ? err.message : String(err))
    }
  }

  const roots = runs.filter((r) => !r.parent_run_id)
  const childrenOf = (id: string) => runs.filter((r) => r.parent_run_id === id)
  const selected = detail

  return (
    <div className="content" id="runs">
      <section className="welcome-row">
        <div>
          <p className="kicker">AGENT ACTIVITY</p>
          <h1>Runs</h1>
          <p>
            {runs.length} runs · {runs.filter((r) => LIVE_STATUSES.includes(r.status)).length} in
            flight
          </p>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>History</h2>
              <p>Boss runs expand to show what they delegated.</p>
            </div>
          </div>
          <div className="run-list">
            {roots.length === 0 && <p className="empty-state">No runs yet.</p>}
            {roots.map((run) => (
              <div key={run.id}>
                <button
                  className={`run-row${selectedId === run.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(run.id)}
                >
                  <span className={`tag ${STATUS_TAG[run.status] ?? 'review'}`}>{run.status}</span>
                  <span className="run-name">
                    <strong>{agentsById.get(run.agent_definition_id)?.name ?? 'Agent'}</strong>
                    <small>{run.input ?? 'No prompt'}</small>
                  </span>
                  <span className="run-meta">
                    {duration(run)}
                    <small>{run.tokens_used ? `${run.tokens_used} tok` : '—'}</small>
                  </span>
                </button>

                {childrenOf(run.id).map((child) => (
                  <button
                    key={child.id}
                    className={`run-row run-child${selectedId === child.id ? ' active' : ''}`}
                    onClick={() => setSelectedId(child.id)}
                  >
                    <span className={`tag ${STATUS_TAG[child.status] ?? 'review'}`}>{child.status}</span>
                    <span className="run-name">
                      <strong>↳ {agentsById.get(child.agent_definition_id)?.name ?? 'Subagent'}</strong>
                      <small>{child.input ?? ''}</small>
                    </span>
                    <span className="run-meta">
                      {duration(child)}
                      <small>{child.tokens_used ? `${child.tokens_used} tok` : '—'}</small>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                Live log {live && <span className="run-live">● streaming</span>}
              </h2>
              <p>{selected ? selected.status : 'Pick a run.'}</p>
            </div>
            {selected && LIVE_STATUSES.includes(selected.status) && (
              <button className="reject-button" onClick={handleCancel}>
                Cancel
              </button>
            )}
          </div>

          <div className="run-log" ref={logRef}>
            {!selectedId && <p className="empty-state">Select a run to watch it.</p>}
            {selectedId && events.length === 0 && (
              <p className="empty-state">{live ? 'Waiting for the first event…' : 'No events.'}</p>
            )}
            {events.map((event, index) => (
              <div className={`run-event run-event-${event.type}`} key={`${event.seq ?? index}`}>
                <span className="run-event-type">{event.type}</span>
                <span>{eventLine(event as never)}</span>
              </div>
            ))}
          </div>

          {selected?.output_summary && (
            <div className="run-summary">
              <p className="kicker">SUMMARY</p>
              {selected.output_summary}
            </div>
          )}
          {selected?.error && <div className="run-summary run-error">{selected.error}</div>}
        </aside>
      </section>
    </div>
  )
}

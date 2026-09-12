import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentAction,
  type Shift,
  type Staff,
  createShift,
  createStaff,
  deleteShift,
  deleteStaff,
  listShifts,
  listStaff,
  updateStaff,
} from '../api/client'

type Props = {
  pendingActions: AgentAction[]
  showToast: (title: string, subtitle?: string) => void
  /** Lets the dashboard refresh its own copy of the roster. */
  onStaffChanged: () => void
}

const BLANK_STAFF = { name: '', role: '', email: '' }

const todayIso = () => new Date().toISOString().slice(0, 10)

const BLANK_SHIFT = { staff_id: '', date: todayIso(), start_time: '17:00', end_time: '23:00', role: '' }

/** "2026-10-01" -> "Thu 1 Oct". Dates are parsed as local, not UTC. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const formatTime = (value: string) => value.slice(0, 5)

function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

export function EmployeesPage({ pendingActions, showToast, onStaffChanged }: Props) {
  const [staff, setStaff] = useState<Staff[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [busy, setBusy] = useState(false)

  const [addingStaff, setAddingStaff] = useState(false)
  const [staffDraft, setStaffDraft] = useState(BLANK_STAFF)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState(BLANK_STAFF)

  const [addingShift, setAddingShift] = useState(false)
  const [shiftDraft, setShiftDraft] = useState(BLANK_SHIFT)

  const refresh = useCallback(() => {
    listStaff().then(setStaff).catch(() => {})
    listShifts().then(setShifts).catch(() => {})
  }, [])

  useEffect(refresh, [refresh])

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])

  const shiftsByDate = useMemo(() => {
    const groups = new Map<string, Shift[]>()
    for (const shift of [...shifts].sort((a, b) =>
      a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date),
    )) {
      const day = groups.get(shift.date) ?? []
      day.push(shift)
      groups.set(shift.date, day)
    }
    return [...groups.entries()]
  }, [shifts])

  const scheduledHours = useMemo(
    () => shifts.reduce((sum, s) => sum + hoursBetween(s.start_time, s.end_time), 0),
    [shifts],
  )

  /** People with no shift on the books -- the gap the agent watches for. */
  const unscheduled = useMemo(
    () => staff.filter((person) => !shifts.some((s) => s.staff_id === person.id)),
    [staff, shifts],
  )

  const shiftProposals = pendingActions.filter((a) => a.action_type === 'shift_change')

  const run = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await work()
      refresh()
      onStaffChanged()
      showToast(ok)
    } catch (err) {
      showToast('That did not work', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAddStaff = () => {
    if (!staffDraft.name.trim() || !staffDraft.role.trim()) {
      showToast('Name and role are required')
      return
    }
    run(async () => {
      await createStaff({
        name: staffDraft.name.trim(),
        role: staffDraft.role.trim(),
        email: staffDraft.email.trim() || null,
      })
      setStaffDraft(BLANK_STAFF)
      setAddingStaff(false)
    }, 'Added to the roster')
  }

  const handleSaveEdit = (person: Staff) => {
    run(async () => {
      await updateStaff(person.id, {
        name: editDraft.name.trim(),
        role: editDraft.role.trim(),
        email: editDraft.email.trim() || null,
      })
      setEditingId(null)
    }, 'Details updated')
  }

  const handleAddShift = () => {
    if (!shiftDraft.staff_id) {
      showToast('Pick who is working')
      return
    }
    if (hoursBetween(shiftDraft.start_time, shiftDraft.end_time) <= 0) {
      showToast('A shift must end after it starts')
      return
    }
    run(async () => {
      const person = staffById.get(shiftDraft.staff_id)
      await createShift({ ...shiftDraft, role: shiftDraft.role.trim() || person?.role || 'staff' })
      setAddingShift(false)
    }, 'Shift scheduled')
  }

  return (
    <div className="content" id="employees">
      <section className="welcome-row">
        <div>
          <p className="kicker">EMPLOYEE MANAGEMENT AGENT</p>
          <h1>Your team</h1>
          <p>
            {staff.length} {staff.length === 1 ? 'person' : 'people'} · {shifts.length} shifts on the
            books · {scheduledHours.toFixed(0)}h scheduled
            {unscheduled.length > 0 && (
              <span className="alert-text"> · {unscheduled.length} with no shift</span>
            )}
          </p>
        </div>
      </section>

      {shiftProposals.length > 0 && (
        <div className="emp-notice">
          <span className="tag review">Agent</span>
          The Employee Management agent has {shiftProposals.length} scheduling{' '}
          {shiftProposals.length === 1 ? 'proposal' : 'proposals'} waiting.{' '}
          <a href="#overview">Review in the action center →</a>
        </div>
      )}

      <section className="lower-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Roster</h2>
              <p>Everyone on the books.</p>
            </div>
            <button className="primary-button" onClick={() => setAddingStaff((v) => !v)}>
              {addingStaff ? 'Cancel' : 'Add person'}
            </button>
          </div>

          {addingStaff && (
            <div className="emp-form">
              <input
                placeholder="Full name"
                value={staffDraft.name}
                autoFocus
                onChange={(e) => setStaffDraft({ ...staffDraft, name: e.target.value })}
              />
              <input
                placeholder="Role (e.g. Server)"
                value={staffDraft.role}
                onChange={(e) => setStaffDraft({ ...staffDraft, role: e.target.value })}
              />
              <input
                placeholder="Email (optional)"
                value={staffDraft.email}
                onChange={(e) => setStaffDraft({ ...staffDraft, email: e.target.value })}
              />
              <button className="approve-button" disabled={busy} onClick={handleAddStaff}>
                Save
              </button>
            </div>
          )}

          <div className="emp-list">
            {staff.length === 0 && <p className="empty-state">Nobody on the roster yet.</p>}

            {staff.map((person) => {
              const editing = editingId === person.id
              const shiftCount = shifts.filter((s) => s.staff_id === person.id).length

              return (
                <article className="emp-row" key={person.id}>
                  {editing ? (
                    <div className="emp-form emp-form-inline">
                      <input
                        value={editDraft.name}
                        autoFocus
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      />
                      <input
                        value={editDraft.role}
                        onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                      />
                      <input
                        value={editDraft.email}
                        placeholder="Email"
                        onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                      />
                      <button className="approve-button" disabled={busy} onClick={() => handleSaveEdit(person)}>
                        Save
                      </button>
                      <button className="secondary-button" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="emp-avatar">
                        {person.name
                          .split(' ')
                          .map((part) => part[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="emp-identity">
                        <strong>{person.name}</strong>
                        <small>{person.email ?? 'No email on file'}</small>
                      </div>
                      <span className="emp-role">{person.role}</span>
                      <span className={`emp-shifts${shiftCount === 0 ? ' none' : ''}`}>
                        {shiftCount === 0 ? 'No shifts' : `${shiftCount} shift${shiftCount === 1 ? '' : 's'}`}
                      </span>
                      <div className="task-actions">
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setEditingId(person.id)
                            setEditDraft({
                              name: person.name,
                              role: person.role,
                              email: person.email ?? '',
                            })
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="reject-button"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Remove ${person.name} from the roster?`)) {
                              run(() => deleteStaff(person.id), `${person.name} removed`)
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </article>
              )
            })}
          </div>
        </div>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <h2>Schedule</h2>
              <p>Who is on, and when.</p>
            </div>
            <button className="primary-button" onClick={() => setAddingShift((v) => !v)}>
              {addingShift ? 'Cancel' : 'Add shift'}
            </button>
          </div>

          {addingShift && (
            <div className="emp-form emp-form-stack">
              <select
                value={shiftDraft.staff_id}
                onChange={(e) => setShiftDraft({ ...shiftDraft, staff_id: e.target.value })}
              >
                <option value="">Who is working?</option>
                {staff.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.role}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={shiftDraft.date}
                onChange={(e) => setShiftDraft({ ...shiftDraft, date: e.target.value })}
              />
              <div className="emp-times">
                <input
                  type="time"
                  value={shiftDraft.start_time}
                  onChange={(e) => setShiftDraft({ ...shiftDraft, start_time: e.target.value })}
                />
                <span>to</span>
                <input
                  type="time"
                  value={shiftDraft.end_time}
                  onChange={(e) => setShiftDraft({ ...shiftDraft, end_time: e.target.value })}
                />
              </div>
              <button className="approve-button" disabled={busy} onClick={handleAddShift}>
                Schedule it
              </button>
            </div>
          )}

          <div className="emp-schedule">
            {shiftsByDate.length === 0 && <p className="empty-state">Nothing scheduled.</p>}

            {shiftsByDate.map(([date, dayShifts]) => (
              <div className="emp-day" key={date}>
                <p className="emp-day-label">{formatDate(date)}</p>
                {dayShifts.map((shift) => (
                  <div className="emp-shift" key={shift.id}>
                    <div>
                      <strong>{staffById.get(shift.staff_id)?.name ?? 'Unknown'}</strong>
                      <small>
                        {formatTime(shift.start_time)}–{formatTime(shift.end_time)} · {shift.role}
                      </small>
                    </div>
                    <button
                      className="emp-remove"
                      disabled={busy}
                      title="Remove shift"
                      onClick={() => run(() => deleteShift(shift.id), 'Shift removed')}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  )
}

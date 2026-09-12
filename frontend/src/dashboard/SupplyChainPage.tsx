import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentAction,
  type SupplyChain,
  createSupplier,
  deleteSupplier,
  fetchSupplyChain,
  updateInventoryItem,
  updateSupplier,
} from '../api/client'

type Props = {
  pendingActions: AgentAction[]
  showToast: (title: string, subtitle?: string) => void
  onInventoryChanged: () => void
}

/** Same validated slot-1 hue the profit page uses for magnitude bars. */
const BAR = '#1f6f9e'

/** Above this share of stock value, a single supplier is a concentration risk. */
const CONCENTRATION_RISK = 60

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const qty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

const BLANK = { name: '', contact_info: '', lead_time_days: '2' }

export function SupplyChainPage({ pendingActions, showToast, onInventoryChanged }: Props) {
  const [data, setData] = useState<SupplyChain | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState(BLANK)

  const load = useCallback(() => {
    fetchSupplyChain().then(setData).catch(() => {})
  }, [])

  useEffect(load, [load])

  const purchaseProposals = pendingActions.filter((a) => a.action_type === 'purchase_order')

  const concentrated = useMemo(
    () => data?.suppliers.find((s) => s.share_pct >= CONCENTRATION_RISK) ?? null,
    [data],
  )

  const run = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await work()
      load()
      onInventoryChanged()
      showToast(ok)
    } catch (err) {
      showToast('That did not work', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <div className="content" id="supply">
        <p className="empty-state">Loading supply chain…</p>
      </div>
    )
  }

  const handleAdd = () => {
    const lead = Number(draft.lead_time_days)
    if (!draft.name.trim()) {
      showToast('Supplier name is required')
      return
    }
    if (!Number.isFinite(lead) || lead < 0) {
      showToast('Lead time must be a number of days')
      return
    }
    run(async () => {
      await createSupplier({
        name: draft.name.trim(),
        contact_info: draft.contact_info.trim() || null,
        lead_time_days: lead,
      })
      setDraft(BLANK)
      setAdding(false)
    }, 'Supplier added')
  }

  const handleSaveEdit = (id: string) => {
    const lead = Number(editDraft.lead_time_days)
    if (!Number.isFinite(lead) || lead < 0) {
      showToast('Lead time must be a number of days')
      return
    }
    run(async () => {
      await updateSupplier(id, {
        name: editDraft.name.trim(),
        contact_info: editDraft.contact_info.trim() || null,
        lead_time_days: lead,
      })
      setEditingId(null)
    }, 'Supplier updated')
  }

  return (
    <div className="content" id="supply">
      <section className="welcome-row">
        <div>
          <p className="kicker">SUPPLY CHAIN AGENT</p>
          <h1>Suppliers and sourcing</h1>
          <p>
            {data.supplier_count} suppliers · {data.item_count} tracked items ·{' '}
            {money(data.total_stock_value)} of stock
            {data.low_stock_count > 0 && (
              <span className="alert-text"> · {data.low_stock_count} need reordering</span>
            )}
          </p>
        </div>
        <button className="primary-button" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Add supplier'}
        </button>
      </section>

      {purchaseProposals.length > 0 && (
        <div className="emp-notice">
          <span className="tag review">Agent</span>
          The Supply Chain agent has {purchaseProposals.length} purchase{' '}
          {purchaseProposals.length === 1 ? 'order' : 'orders'} waiting.{' '}
          <a href="#overview">Review in the action center →</a>
        </div>
      )}

      {concentrated && (
        <div className="mkt-callout">
          <div>
            <p className="kicker">CONCENTRATION RISK</p>
            <strong>
              {concentrated.share_pct}% of stock value comes from {concentrated.name}
            </strong>
            <p>
              {concentrated.item_count} of {data.item_count} items, {money(concentrated.stock_value)}.
              A disruption there stops most of the kitchen.
            </p>
          </div>
          <span className="tag urgent">Single source</span>
        </div>
      )}

      {data.unassigned_item_count > 0 && (
        <div className="mkt-callout">
          <div>
            <p className="kicker">UNSOURCED</p>
            <strong>
              {data.unassigned_item_count}{' '}
              {data.unassigned_item_count === 1 ? 'item has' : 'items have'} no supplier
            </strong>
            <p>
              {money(data.unassigned_stock_value)} of stock with nobody to reorder from — assign
              one below.
            </p>
          </div>
          <span className="tag urgent">No source</span>
        </div>
      )}

      <div className="metrics pft-metrics">
        <div className="metric-card">
          <div className="metric-top"><span>Stock value</span></div>
          <strong>{money(data.total_stock_value)}</strong>
          <div className="metric-foot">across {data.supplier_count} suppliers</div>
        </div>
        <div className={`metric-card${data.low_stock_count > 0 ? ' alert-card' : ''}`}>
          <div className="metric-top"><span>Need reordering</span></div>
          <strong>{data.low_stock_count}</strong>
          <div className="metric-foot">of {data.item_count} items</div>
        </div>
        <div className="metric-card">
          <div className="metric-top"><span>Cost to restock</span></div>
          <strong>{money(data.restock_cost)}</strong>
          <div className="metric-foot">to clear every shortfall</div>
        </div>
        <div className="metric-card">
          <div className="metric-top"><span>Longest lead time</span></div>
          <strong>{data.longest_lead_days}d</strong>
          <div className="metric-foot">on what is short</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Suppliers</h2>
            <p>Who supplies what, and how long they take.</p>
          </div>
        </div>

        {adding && (
          <div className="emp-form">
            <input
              placeholder="Supplier name"
              value={draft.name}
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              placeholder="Contact (email or phone)"
              value={draft.contact_info}
              onChange={(e) => setDraft({ ...draft, contact_info: e.target.value })}
            />
            <input
              placeholder="Lead days"
              inputMode="numeric"
              value={draft.lead_time_days}
              onChange={(e) => setDraft({ ...draft, lead_time_days: e.target.value })}
            />
            <button className="approve-button" disabled={busy} onClick={handleAdd}>
              Save
            </button>
          </div>
        )}

        <div className="scm-row scm-head">
          <span>Supplier</span>
          <span>Share of stock value</span>
          <span className="inv-num">Items</span>
          <span className="inv-num">Lead</span>
          <span />
        </div>

        <div>
          {data.suppliers.length === 0 && <p className="empty-state">No suppliers yet.</p>}

          {data.suppliers.map((supplier) =>
            editingId === supplier.id ? (
              <article className="scm-row scm-editing" key={supplier.id}>
                <div className="emp-form emp-form-inline">
                  <input
                    value={editDraft.name}
                    autoFocus
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  />
                  <input
                    placeholder="Contact"
                    value={editDraft.contact_info}
                    onChange={(e) => setEditDraft({ ...editDraft, contact_info: e.target.value })}
                  />
                  <input
                    placeholder="Lead days"
                    inputMode="numeric"
                    value={editDraft.lead_time_days}
                    onChange={(e) => setEditDraft({ ...editDraft, lead_time_days: e.target.value })}
                  />
                  <button className="approve-button" disabled={busy} onClick={() => handleSaveEdit(supplier.id)}>
                    Save
                  </button>
                  <button className="secondary-button" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </article>
            ) : (
              <article className="scm-row" key={supplier.id}>
                <div className="scm-name">
                  <strong>{supplier.name}</strong>
                  <small>{supplier.contact_info ?? 'No contact on file'}</small>
                </div>

                <div className="scm-share">
                  <div className="pft-bar-track">
                    <div
                      className="pft-bar"
                      style={{ width: `${supplier.share_pct}%`, background: BAR }}
                    />
                  </div>
                  <span>
                    {supplier.share_pct}%
                    <small>{money(supplier.stock_value)}</small>
                  </span>
                </div>

                <div className="inv-num">
                  <strong>{supplier.item_count}</strong>
                  {supplier.low_stock_count > 0 && (
                    <small className="alert-text">{supplier.low_stock_count} low</small>
                  )}
                </div>

                <div className="inv-num">
                  <strong>{supplier.lead_time_days}d</strong>
                </div>

                <div className="task-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditingId(supplier.id)
                      setEditDraft({
                        name: supplier.name,
                        contact_info: supplier.contact_info ?? '',
                        lead_time_days: String(supplier.lead_time_days),
                      })
                    }}
                  >
                    Edit
                  </button>
                  {supplier.item_count === 0 && (
                    <button
                      className="reject-button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Remove ${supplier.name}?`)) {
                          run(() => deleteSupplier(supplier.id), `${supplier.name} removed`)
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="panel scm-panel">
        <div className="panel-heading">
          <div>
            <h2>Needs reordering</h2>
            <p>Below the reorder point, longest lead time first.</p>
          </div>
        </div>

        {data.low_stock.length === 0 ? (
          <p className="empty-state">Everything is above its reorder point.</p>
        ) : (
          <div>
            {data.low_stock.map((item) => (
              <article className="scm-low" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {qty(item.quantity_on_hand)} {item.unit} on hand · reorder at{' '}
                    {qty(item.reorder_threshold)}
                  </small>
                </div>

                <div className="scm-source">
                  {item.supplier_name ? (
                    <>
                      <strong>{item.supplier_name}</strong>
                      <small>{item.lead_time_days}d lead time</small>
                    </>
                  ) : (
                    <select
                      className="scm-assign"
                      defaultValue=""
                      disabled={busy}
                      onChange={(e) =>
                        e.target.value &&
                        run(
                          () => updateInventoryItem(item.id, { supplier_id: e.target.value }),
                          `${item.name} sourced`,
                        )
                      }
                    >
                      <option value="">Assign a supplier…</option>
                      {data.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.lead_time_days}d)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="inv-num">
                  <strong>{money(item.restock_cost)}</strong>
                  <small>
                    {qty(item.reorder_qty)} {item.unit}
                  </small>
                </div>

                <span className="tag urgent">Low</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="pft-caveat">
        There is no purchase-order lifecycle yet: approving a reorder books the goods as
        received immediately rather than tracking them in transit, so lead times are reference
        information, not a delivery schedule.
      </p>
    </div>
  )
}

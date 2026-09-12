import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentAction,
  type InventoryItem,
  type MenuPerformance,
  createMenuItem,
  deleteMenuItem,
  listInventoryItems,
  listMenuPerformance,
  updateMenuItem,
} from '../api/client'
import { RecipeEditor } from './RecipeEditor'

type Props = {
  pendingActions: AgentAction[]
  showToast: (title: string, subtitle?: string) => void
}

const BLANK = { name: '', category: '', price: '', cost: '', description: '' }

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

/** Items selling at or below this share of the best seller are "slow". */
const SLOW_FRACTION = 0.25

export function MarketingPage({ pendingActions, showToast }: Props) {
  const [rows, setRows] = useState<MenuPerformance[]>([])
  const [busy, setBusy] = useState(false)
  const [sort, setSort] = useState<'units_sold' | 'profit' | 'margin_pct'>('units_sold')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ price: '', description: '' })
  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [ingredients, setIngredients] = useState<InventoryItem[]>([])

  const refresh = useCallback(() => {
    listMenuPerformance().then(setRows).catch(() => {})
  }, [])

  useEffect(refresh, [refresh])
  useEffect(() => {
    listInventoryItems().then(setIngredients).catch(() => {})
  }, [])

  const menuProposals = pendingActions.filter((a) => a.action_type === 'menu_change')

  const totals = useMemo(() => {
    const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
    const profit = rows.reduce((sum, r) => sum + r.profit, 0)
    return { revenue, profit, offMenu: rows.filter((r) => !r.is_available).length }
  }, [rows])

  const bestSellerUnits = useMemo(
    () => Math.max(0, ...rows.map((r) => r.units_sold)),
    [rows],
  )

  /** Never sold, or selling far behind the leader -- the agent's promotion candidates. */
  const isSlow = useCallback(
    (row: MenuPerformance) =>
      row.is_available && row.units_sold <= Math.max(0, bestSellerUnits * SLOW_FRACTION),
    [bestSellerUnits],
  )

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b[sort] - a[sort]),
    [rows, sort],
  )

  const slowMovers = useMemo(() => rows.filter(isSlow), [rows, isSlow])

  const run = async (work: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await work()
      refresh()
      showToast(ok)
    } catch (err) {
      showToast('That did not work', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = () => {
    const price = Number(draft.price)
    const cost = Number(draft.cost)
    if (!draft.name.trim() || !draft.category.trim()) {
      showToast('Name and category are required')
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Enter a price')
      return
    }
    run(async () => {
      await createMenuItem({
        name: draft.name.trim(),
        category: draft.category.trim(),
        price,
        cost: Number.isFinite(cost) ? cost : 0,
        description: draft.description.trim() || null,
      })
      setDraft(BLANK)
      setAdding(false)
    }, 'Added to the menu')
  }

  const handleSaveEdit = (row: MenuPerformance) => {
    const price = Number(editDraft.price)
    if (!Number.isFinite(price) || price < 0) {
      showToast('Enter a valid price')
      return
    }
    run(async () => {
      await updateMenuItem(row.id, { price, description: editDraft.description.trim() || null })
      setEditingId(null)
    }, 'Menu updated')
  }

  return (
    <div className="content" id="marketing">
      <section className="welcome-row">
        <div>
          <p className="kicker">MARKETING / PRODUCT AGENT</p>
          <h1>Menu performance</h1>
          <p>
            {rows.length} dishes · {money(totals.revenue)} revenue · {money(totals.profit)} gross
            profit
            {totals.offMenu > 0 && <span> · {totals.offMenu} off menu</span>}
          </p>
        </div>
      </section>

      {menuProposals.length > 0 && (
        <div className="emp-notice">
          <span className="tag review">Agent</span>
          The Marketing agent has {menuProposals.length} menu{' '}
          {menuProposals.length === 1 ? 'proposal' : 'proposals'} waiting.{' '}
          <a href="#overview">Review in the action center →</a>
        </div>
      )}

      {slowMovers.length > 0 && (
        <div className="mkt-callout">
          <div>
            <p className="kicker">PROMOTION CANDIDATES</p>
            <strong>
              {slowMovers.length} {slowMovers.length === 1 ? 'dish is' : 'dishes are'} barely
              selling
            </strong>
            <p>{slowMovers.map((r) => r.name).join(' · ')}</p>
          </div>
          <span className="tag urgent">Slow</span>
        </div>
      )}

      <section className="panel mkt-panel">
        <div className="panel-heading">
          <div>
            <h2>The menu</h2>
            <p>What each dish sells and earns.</p>
          </div>
          <div className="mkt-controls">
            <div className="tabs">
              <button
                className={`tab${sort === 'units_sold' ? ' active' : ''}`}
                onClick={() => setSort('units_sold')}
              >
                Units
              </button>
              <button
                className={`tab${sort === 'profit' ? ' active' : ''}`}
                onClick={() => setSort('profit')}
              >
                Profit
              </button>
              <button
                className={`tab${sort === 'margin_pct' ? ' active' : ''}`}
                onClick={() => setSort('margin_pct')}
              >
                Margin
              </button>
            </div>
            <button className="primary-button" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cancel' : 'Add dish'}
            </button>
          </div>
        </div>

        {adding && (
          <div className="emp-form">
            <input
              placeholder="Dish name"
              value={draft.name}
              autoFocus
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              placeholder="Category"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            />
            <input
              placeholder="Price"
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            />
            <input
              placeholder="Cost"
              inputMode="decimal"
              value={draft.cost}
              onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
            />
            <button className="approve-button" disabled={busy} onClick={handleAdd}>
              Save
            </button>
          </div>
        )}

        <div className="mkt-row mkt-head">
          <span>Dish</span>
          <span className="inv-num">Price</span>
          <span className="inv-num">Sold</span>
          <span className="inv-num">Revenue</span>
          <span>Margin</span>
          <span />
        </div>

        <div className="mkt-list">
          {rows.length === 0 && <p className="empty-state">No menu items yet.</p>}

          {sorted.map((row) => {
            const share = bestSellerUnits > 0 ? (row.units_sold / bestSellerUnits) * 100 : 0

            if (editingId === row.id) {
              return (
                <article className="mkt-row mkt-editing" key={row.id}>
                  <div className="emp-form emp-form-inline">
                    <input
                      value={editDraft.price}
                      inputMode="decimal"
                      autoFocus
                      onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                    />
                    <input
                      placeholder="Description"
                      value={editDraft.description}
                      onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                    />
                    <button className="approve-button" disabled={busy} onClick={() => handleSaveEdit(row)}>
                      Save
                    </button>
                    <button className="secondary-button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </article>
              )
            }

            return (
              <article className="mkt-row" key={row.id} data-off={!row.is_available}>
                <div className="mkt-dish">
                  <strong>
                    {row.name}
                    {!row.is_available && <span className="mkt-off">Off menu</span>}
                  </strong>
                  <small>
                    {row.category}
                    {row.description ? ` · ${row.description}` : ''}
                  </small>
                </div>

                <div className="inv-num">
                  {money(row.price)}
                  <small className={row.cost_source === 'recipe' ? 'mkt-costed' : 'mkt-guessed'}>
                    {money(row.cost)} {row.cost_source === 'recipe' ? 'costed' : 'estimated'}
                  </small>
                </div>

                <div className="inv-num">
                  <strong>{row.units_sold}</strong>
                  <small>{money(row.profit)} profit</small>
                </div>

                <div className="inv-num">{money(row.revenue)}</div>

                <div className="mkt-margin">
                  <div className="inv-track">
                    <div className="inv-fill" style={{ width: `${Math.min(100, row.margin_pct)}%` }} />
                  </div>
                  <span>{row.margin_pct.toFixed(0)}%</span>
                </div>

                <div className="task-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditingId(row.id)
                      setEditDraft({ price: String(row.price), description: row.description ?? '' })
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setRecipeFor(recipeFor === row.id ? null : row.id)}
                  >
                    Recipe
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => updateMenuItem(row.id, { is_available: !row.is_available }),
                        row.is_available ? `${row.name} taken off the menu` : `${row.name} is back on`,
                      )
                    }
                  >
                    {row.is_available ? 'Take off' : 'Put back'}
                  </button>
                  {row.units_sold === 0 && (
                    <button
                      className="reject-button"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Delete ${row.name}? It has never sold.`)) {
                          run(() => deleteMenuItem(row.id), `${row.name} deleted`)
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div className="mkt-share" style={{ width: `${share}%` }} aria-hidden />

                {recipeFor === row.id && (
                  <div className="mkt-recipe-slot">
                    <RecipeEditor
                      menuItemId={row.id}
                      ingredients={ingredients}
                      showToast={showToast}
                      onSaved={refresh}
                      onClose={() => setRecipeFor(null)}
                    />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}

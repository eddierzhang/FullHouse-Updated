import { useState } from 'react'
import type { InventoryItem, Supplier } from '../api/client'

type Props = {
  items: InventoryItem[]
  suppliers: Supplier[]
}

const isLow = (item: InventoryItem) => item.quantity_on_hand <= item.reorder_threshold

/** How far above the reorder point an item sits, for sorting most-urgent first. */
const headroom = (item: InventoryItem) => item.quantity_on_hand - item.reorder_threshold

/**
 * Bar fill as a percentage, scaled so the reorder threshold sits at the
 * halfway mark -- a half-empty bar means "order more now".
 */
function fillPercent(item: InventoryItem): number {
  if (item.reorder_threshold <= 0) return item.quantity_on_hand > 0 ? 100 : 0
  return Math.min(100, (item.quantity_on_hand / (item.reorder_threshold * 2)) * 100)
}

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

/** Trims the trailing ".0" that every whole-number quantity would otherwise show. */
const quantity = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

export function InventoryPanel({ items, suppliers }: Props) {
  const [filter, setFilter] = useState<'all' | 'low'>('all')

  const supplierName = (id: string | null) =>
    (id && suppliers.find((s) => s.id === id)?.name) || 'No supplier'

  const lowCount = items.filter(isLow).length
  const totalValue = items.reduce((sum, i) => sum + i.quantity_on_hand * i.unit_cost, 0)

  const visible = [...items]
    .filter((item) => (filter === 'low' ? isLow(item) : true))
    .sort((a, b) => headroom(a) - headroom(b))

  return (
    <section className="panel inventory-panel" id="inventory">
      <div className="panel-heading">
        <div>
          <p className="kicker">INVENTORY AGENT</p>
          <h2>What's in the building</h2>
          <p>
            {items.length} tracked {items.length === 1 ? 'item' : 'items'} · {money(totalValue)} on hand
            {lowCount > 0 && <span className="alert-text"> · {lowCount} below reorder point</span>}
          </p>
        </div>
        <div className="tabs">
          <button className={`tab${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            All <span>{items.length}</span>
          </button>
          <button className={`tab${filter === 'low' ? ' active' : ''}`} onClick={() => setFilter('low')}>
            Low <span>{lowCount}</span>
          </button>
        </div>
      </div>

      <div className="inv-row inv-head">
        <span>Item</span>
        <span>Stock level</span>
        <span className="inv-num">On hand</span>
        <span className="inv-num">Reorder at</span>
        <span className="inv-num">Value</span>
      </div>

      <div className="inv-list">
        {visible.length === 0 && (
          <p className="empty-state">
            {items.length === 0 ? 'No inventory items yet.' : 'Nothing is below its reorder point.'}
          </p>
        )}

        {visible.map((item) => {
          const low = isLow(item)
          const value = item.quantity_on_hand * item.unit_cost

          return (
            <article className="inv-row" key={item.id} data-low={low}>
              <div className="inv-name">
                <strong>{item.name}</strong>
                <small>{supplierName(item.supplier_id)}</small>
              </div>

              <div className="inv-gauge" title={`Reorder point at ${quantity(item.reorder_threshold)} ${item.unit}`}>
                <div className="inv-track">
                  <div
                    className={`inv-fill${low ? ' low' : ''}`}
                    style={{ width: `${fillPercent(item)}%` }}
                  />
                  {/* The reorder point always sits at the midpoint of the track. */}
                  <span className="inv-mark" />
                </div>
                {low ? (
                  <span className="tag urgent">Reorder {quantity(item.reorder_qty)}</span>
                ) : (
                  <span className="inv-ok">In stock</span>
                )}
              </div>

              <div className="inv-num">
                <strong>{quantity(item.quantity_on_hand)}</strong>
                <small>{item.unit}</small>
              </div>

              <div className="inv-num inv-dim">{quantity(item.reorder_threshold)}</div>

              <div className="inv-num">
                <strong>{money(value)}</strong>
                <small>{money(item.unit_cost)}/{item.unit}</small>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

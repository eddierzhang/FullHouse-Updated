import { useCallback, useEffect, useMemo, useState } from 'react'
import { type ProfitSummary, fetchProfitSummary } from '../api/client'

type Props = {
  showToast: (title: string, subtitle?: string) => void
}

/**
 * Series colors.
 *
 * Not the app's --green/--coral: that pair collapses under protanopia
 * (adjacent CVD ΔE 5.6), and --green is below the chroma floor so it reads
 * gray as a thin mark. This blue/orange pair validates clean — protan ΔE
 * 18.2, normal 28.0, both >= 3:1 on white.
 */
const REVENUE = '#1f6f9e'
const PROFIT = '#d2652b'

const PLOT = { w: 720, h: 190, top: 14, right: 16, bottom: 26, left: 48 }

const money = (value: number, cents = false) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents ? 2 : 0,
  })

/** Rounds an axis maximum up to a clean 1/2/5 × 10ⁿ step. */
function niceMax(value: number): number {
  if (value <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * magnitude) return step * magnitude
  }
  return 10 * magnitude
}

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function StatTile({
  label,
  value,
  foot,
  accent,
}: {
  label: string
  value: string
  foot?: string
  accent?: boolean
}) {
  return (
    <div className={`metric-card${accent ? ' pft-hero' : ''}`}>
      <div className="metric-top">
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {foot && <div className="metric-foot">{foot}</div>}
    </div>
  )
}

export function ProfitPage({ showToast }: Props) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<ProfitSummary | null>(null)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [hover, setHover] = useState<number | null>(null)

  const load = useCallback(() => {
    fetchProfitSummary(days)
      .then(setData)
      .catch((err) => showToast('Could not load profit data', String(err)))
  }, [days, showToast])

  useEffect(load, [load])

  const scale = useMemo(() => {
    if (!data) return null
    const max = niceMax(Math.max(1, ...data.daily.map((d) => d.revenue)))
    const innerW = PLOT.w - PLOT.left - PLOT.right
    const innerH = PLOT.h - PLOT.top - PLOT.bottom
    const n = data.daily.length
    const x = (i: number) => PLOT.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = (v: number) => PLOT.top + innerH - (v / max) * innerH
    const path = (key: 'revenue' | 'profit') =>
      data.daily.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')
    return { max, x, y, path, innerW, innerH, n, baseline: PLOT.top + innerH }
  }, [data])

  if (!data || !scale) {
    return (
      <div className="content" id="profit">
        <p className="empty-state">Loading profit data…</p>
      </div>
    )
  }

  const last = data.daily[data.daily.length - 1]
  const ticks = [0, 0.5, 1].map((f) => scale.max * f)
  const hovered = hover !== null ? data.daily[hover] : null
  const maxCategoryRevenue = Math.max(1, ...data.by_category.map((c) => c.revenue))

  return (
    <div className="content" id="profit">
      <section className="welcome-row">
        <div>
          <p className="kicker">PROFIT AGENT</p>
          <h1>Profit monitor</h1>
          <p>
            {shortDate(data.start)} – {shortDate(data.end)} · {data.orders}{' '}
            {data.orders === 1 ? 'order' : 'orders'}
          </p>
        </div>
        <div className="tabs">
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              className={`tab${days === option ? ' active' : ''}`}
              onClick={() => setDays(option)}
            >
              {option}d
            </button>
          ))}
        </div>
      </section>

      <div className="metrics pft-metrics">
        <StatTile label="Revenue" value={money(data.revenue)} foot={`${data.orders} orders`} />
        <StatTile
          label="Gross profit"
          value={money(data.gross_profit)}
          foot={`${money(data.cogs)} cost of goods`}
          accent
        />
        <StatTile label="Gross margin" value={`${data.margin_pct.toFixed(1)}%`} foot="of revenue" />
        <StatTile label="Average order" value={money(data.average_order_value, true)} foot="per order" />
        <StatTile label="Stock on hand" value={money(data.inventory_value)} foot="capital tied up" />
      </div>

      <section className="panel pft-panel">
        <div className="panel-heading">
          <div>
            <h2>Revenue and gross profit</h2>
            <p>Daily, over the selected window.</p>
          </div>
          <div className="mkt-controls">
            <div className="pft-legend">
              <span>
                <i style={{ background: REVENUE }} /> Revenue
              </span>
              <span>
                <i style={{ background: PROFIT }} /> Gross profit
              </span>
            </div>
            <div className="tabs">
              <button
                className={`tab${view === 'chart' ? ' active' : ''}`}
                onClick={() => setView('chart')}
              >
                Chart
              </button>
              <button
                className={`tab${view === 'table' ? ' active' : ''}`}
                onClick={() => setView('table')}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {view === 'chart' ? (
          <div className="pft-chart">
            <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} role="img" aria-label="Daily revenue and gross profit">
              {ticks.map((value) => (
                <g key={value}>
                  <line
                    x1={PLOT.left}
                    x2={PLOT.w - PLOT.right}
                    y1={scale.y(value)}
                    y2={scale.y(value)}
                    className="pft-grid"
                  />
                  <text x={PLOT.left - 9} y={scale.y(value) + 3} className="pft-tick" textAnchor="end">
                    {money(value)}
                  </text>
                </g>
              ))}

              <path d={`${scale.path('revenue')} L${scale.x(scale.n - 1)},${scale.baseline} L${scale.x(0)},${scale.baseline} Z`}
                fill={REVENUE} opacity="0.1" />

              <path d={scale.path('revenue')} fill="none" stroke={REVENUE} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              <path d={scale.path('profit')} fill="none" stroke={PROFIT} strokeWidth="2"
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

              {hovered && hover !== null && (
                <line x1={scale.x(hover)} x2={scale.x(hover)} y1={PLOT.top} y2={scale.baseline}
                  className="pft-crosshair" />
              )}

              {/* End markers carry a surface ring so they stay legible on the line. */}
              {(['revenue', 'profit'] as const).map((key) => (
                <circle key={key} cx={scale.x(scale.n - 1)} cy={scale.y(last[key])} r="4"
                  fill={key === 'revenue' ? REVENUE : PROFIT} stroke="#fff" strokeWidth="2" />
              ))}

              {/* Only the endpoints are labelled; the axis and tooltip carry the rest. */}
              <text x={scale.x(scale.n - 1) - 8} y={scale.y(last.revenue) - 9} className="pft-endlabel" textAnchor="end">
                {money(last.revenue)}
              </text>

              <text x={PLOT.left} y={PLOT.h - 8} className="pft-tick">{shortDate(data.daily[0].date)}</text>
              <text x={PLOT.w - PLOT.right} y={PLOT.h - 8} className="pft-tick" textAnchor="end">
                {shortDate(last.date)}
              </text>

              {data.daily.map((d, i) => (
                <rect key={d.date} x={scale.x(i) - scale.innerW / (2 * Math.max(1, scale.n - 1))}
                  y={PLOT.top} width={scale.innerW / Math.max(1, scale.n - 1)} height={scale.innerH}
                  fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
              ))}
            </svg>

            {hovered && (
              <div className="pft-tooltip" style={{ left: `${(scale.x(hover!) / PLOT.w) * 100}%` }}>
                <strong>{shortDate(hovered.date)}</strong>
                <span><i style={{ background: REVENUE }} /> {money(hovered.revenue, true)} revenue</span>
                <span><i style={{ background: PROFIT }} /> {money(hovered.profit, true)} profit</span>
                <small>{hovered.orders} {hovered.orders === 1 ? 'order' : 'orders'}</small>
              </div>
            )}
          </div>
        ) : (
          <div className="pft-table-wrap">
            <table className="pft-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Orders</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Gross profit</th>
                </tr>
              </thead>
              <tbody>
                {data.daily
                  .filter((d) => d.orders > 0)
                  .map((d) => (
                    <tr key={d.date}>
                      <td>{shortDate(d.date)}</td>
                      <td>{d.orders}</td>
                      <td>{money(d.revenue, true)}</td>
                      <td>{money(d.cogs, true)}</td>
                      <td>{money(d.profit, true)}</td>
                    </tr>
                  ))}
                {data.orders === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-state">No trade in this window.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lower-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Where the profit comes from</h2>
              <p>By menu category.</p>
            </div>
          </div>
          <div className="pft-bars">
            {data.by_category.length === 0 && <p className="empty-state">Nothing sold yet.</p>}
            {data.by_category.map((c) => (
              <div className="pft-bar-row" key={c.category} title={`${c.units} sold`}>
                <span className="pft-bar-label">{c.category}</span>
                <div className="pft-bar-track">
                  <div
                    className="pft-bar"
                    style={{ width: `${(c.revenue / maxCategoryRevenue) * 100}%`, background: REVENUE }}
                  />
                </div>
                <span className="pft-bar-value">
                  {money(c.revenue)}
                  <small>{money(c.profit)} profit</small>
                </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel">
          <div className="panel-heading">
            <div>
              <h2>Order mix</h2>
              <p>By channel.</p>
            </div>
          </div>
          <div className="pft-bars">
            {data.by_channel.length === 0 && <p className="empty-state">No orders yet.</p>}

            {/* One channel is a single bar -- a sentence says it better. */}
            {data.by_channel.length === 1 && (
              <p className="pft-single">
                All {data.by_channel[0].orders} orders were{' '}
                <strong>{data.by_channel[0].channel.replace('_', '-')}</strong>, worth{' '}
                {money(data.by_channel[0].revenue)}.
              </p>
            )}

            {data.by_channel.length > 1 &&
              data.by_channel.map((c) => (
                <div className="pft-bar-row" key={c.channel}>
                  <span className="pft-bar-label">{c.channel.replace('_', '-')}</span>
                  <div className="pft-bar-track">
                    <div
                      className="pft-bar"
                      style={{
                        width: `${(c.revenue / Math.max(1, ...data.by_channel.map((x) => x.revenue))) * 100}%`,
                        background: REVENUE,
                      }}
                    />
                  </div>
                  <span className="pft-bar-value">
                    {money(c.revenue)}
                    <small>{c.orders} orders</small>
                  </span>
                </div>
              ))}
          </div>
        </aside>
      </section>

      <p className="pft-caveat">
        Gross profit uses each dish's recorded cost. Nothing ties a dish to the ingredients it
        consumes yet, so these margins are only as accurate as those figures.
      </p>
    </div>
  )
}

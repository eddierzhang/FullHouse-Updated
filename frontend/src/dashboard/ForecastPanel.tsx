type Props = {
  onRunScenario: () => void
  scenarioBusy: boolean
  scenarioResult: string | null
}

export function ForecastPanel({ onRunScenario, scenarioBusy, scenarioResult }: Props) {
  return (
    <aside className="panel profit-panel">
      <div className="panel-heading">
        <div>
          <p className="kicker">PROFIT CONTROL</p>
          <h2>Tonight's forecast</h2>
        </div>
        <span className="confidence">Illustrative</span>
      </div>
      <div className="forecast-value">
        <strong>$2,340</strong>
        <span className="positive">+$180 optimized</span>
      </div>
      <div className="chart" aria-label="Hourly profit forecast chart">
        <div className="chart-labels">
          <span>$3k</span>
          <span>$2k</span>
          <span>$1k</span>
        </div>
        <svg viewBox="0 0 430 150" role="img" aria-label="Profit rises into dinner service">
          <defs>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f18b5b" stopOpacity=".32" />
              <stop offset="100%" stopColor="#f18b5b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="area"
            d="M0,132 C48,126 65,116 100,118 S155,105 188,108 S245,92 275,79 S322,72 351,44 S391,26 430,14 L430,150 L0,150Z"
          />
          <path className="line" d="M0,132 C48,126 65,116 100,118 S155,105 188,108 S245,92 275,79 S322,72 351,44 S391,26 430,14" />
          <circle cx="351" cy="44" r="5" />
          <line x1="351" x2="351" y1="44" y2="150" className="guide" />
        </svg>
        <div className="chart-times">
          <span>12 PM</span>
          <span>3 PM</span>
          <span>6 PM</span>
          <span>9 PM</span>
        </div>
      </div>
      {scenarioResult && <div className="boss-summary" style={{ margin: '0 18px 12px' }}>{scenarioResult}</div>}
      <button className="scenario-button" onClick={onRunScenario} disabled={scenarioBusy}>
        {scenarioBusy ? 'Asking the Profit Agent…' : 'Run profit scenario'} <span>→</span>
      </button>
    </aside>
  )
}

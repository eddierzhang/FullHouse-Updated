export function MetricsRow({ pendingCount }: { pendingCount: number }) {
  return (
    <section className="metrics" aria-label="Key performance indicators">
      <article className="metric-card">
        <div className="metric-top">
          <span>Today's revenue</span>
          <span className="metric-icon green">↗</span>
        </div>
        <strong>$8,420</strong>
        <div className="metric-foot">
          <span className="positive">↑ 12.4%</span>
          <span>vs. last Saturday</span>
        </div>
      </article>
      <article className="metric-card">
        <div className="metric-top">
          <span>Projected profit</span>
          <span className="metric-icon amber">◒</span>
        </div>
        <strong>$2,340</strong>
        <div className="metric-foot">
          <span className="positive">27.8% margin</span>
          <span>↑ 2.1 pts</span>
        </div>
      </article>
      <article className="metric-card">
        <div className="metric-top">
          <span>Labor cost</span>
          <span className="metric-icon blue">♙</span>
        </div>
        <strong>24.2%</strong>
        <div className="metric-foot">
          <span className="positive">On target</span>
          <span>18 staff scheduled</span>
        </div>
      </article>
      <article className={`metric-card${pendingCount > 0 ? ' alert-card' : ''}`}>
        <div className="metric-top">
          <span>Needs attention</span>
          <span className="metric-icon coral">!</span>
        </div>
        <strong>{pendingCount} {pendingCount === 1 ? 'item' : 'items'}</strong>
        <div className="metric-foot">
          <span className={pendingCount > 0 ? 'alert-text' : 'positive'}>
            {pendingCount > 0 ? 'Awaiting review' : 'All clear'}
          </span>
        </div>
      </article>
    </section>
  )
}

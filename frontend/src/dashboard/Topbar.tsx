type Props = {
  onMenuToggle: () => void
  onNewTask: () => void
}

export function Topbar({ onMenuToggle, onNewTask }: Props) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <header className="topbar">
      <button className="menu-toggle" aria-label="Toggle navigation" onClick={onMenuToggle}>
        ☰
      </button>
      <div className="eyebrow">
        <span className="live-dot"></span> Live operations
      </div>
      <div className="top-actions">
        <button className="date-button">
          {today} <span>⌄</span>
        </button>
        <button className="primary-button" onClick={onNewTask}>
          <span>＋</span> New task
        </button>
      </div>
    </header>
  )
}

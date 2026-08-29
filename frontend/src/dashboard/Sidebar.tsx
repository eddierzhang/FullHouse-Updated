type Props = {
  open: boolean
  apiStatus: 'checking' | 'ok' | 'error'
  agentCount: number
  pendingCount: number
}

export function Sidebar({ open, apiStatus, agentCount, pendingCount }: Props) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
      <a className="brand" href="#overview" aria-label="Savor home">
        <span className="brand-mark">S</span>
        <span>
          Savor<span className="brand-dot">.</span>
        </span>
      </a>

      <nav className="nav-list">
        <p className="nav-label">Workspace</p>
        <a className="nav-item active" href="#overview">
          <span className="icon">⌂</span>
          <span>Overview</span>
        </a>
        <a className="nav-item" href="#agents">
          <span className="icon">✦</span>
          <span>Agents</span>
          <span className="nav-badge">{agentCount}</span>
        </a>
        <a className="nav-item" href="#tasks">
          <span className="icon">✓</span>
          <span>Tasks</span>
          {pendingCount > 0 && <span className="nav-badge warning">{pendingCount}</span>}
        </a>
        <p className="nav-label">Restaurant</p>
        <a className="nav-item" href="#agents">
          <span className="icon">♙</span>
          <span>Team</span>
        </a>
      </nav>

      <div className={`sidebar-status${apiStatus !== 'ok' ? ' offline' : ''}`}>
        <div className={`status-orbit${apiStatus !== 'ok' ? ' offline' : ''}`}>
          <span></span>
        </div>
        <div>
          <strong>{apiStatus === 'ok' ? 'All systems online' : apiStatus === 'checking' ? 'Connecting…' : 'Backend unreachable'}</strong>
          <small>{apiStatus === 'ok' ? 'Live' : 'Check the API server'}</small>
        </div>
      </div>
      <div className="profile">
        <div className="avatar">AM</div>
        <div>
          <strong>Alex Morgan</strong>
          <small>General Manager</small>
        </div>
      </div>
    </aside>
  )
}

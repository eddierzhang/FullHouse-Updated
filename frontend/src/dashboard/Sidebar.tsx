type Props = {
  open: boolean
  apiStatus: 'checking' | 'ok' | 'error'
  agentCount: number
  pendingCount: number
  lowStockCount: number
  route: string
}

export function Sidebar({ open, apiStatus, agentCount, pendingCount, lowStockCount, route }: Props) {
  const navClass = (target: string) => `nav-item${route === target ? ' active' : ''}`
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
        <a className={navClass('overview')} href="#overview">
          <span className="icon">⌂</span>
          <span>Overview</span>
        </a>
        <a className={navClass('agents')} href="#agents">
          <span className="icon">✦</span>
          <span>Agents</span>
          <span className="nav-badge">{agentCount}</span>
        </a>
        <a className={navClass('runs')} href="#runs">
          <span className="icon">◷</span>
          <span>Runs</span>
        </a>
        <a className={navClass('tasks')} href="#tasks">
          <span className="icon">✓</span>
          <span>Tasks</span>
          {pendingCount > 0 && <span className="nav-badge warning">{pendingCount}</span>}
        </a>
        <p className="nav-label">Restaurant</p>
        <a className={navClass('inventory')} href="#inventory">
          <span className="icon">▤</span>
          <span>Inventory</span>
          {lowStockCount > 0 && <span className="nav-badge warning">{lowStockCount}</span>}
        </a>
        <a className={navClass('supply')} href="#supply">
          <span className="icon">⇄</span>
          <span>Suppliers</span>
        </a>
        <a className={navClass('profit')} href="#profit">
          <span className="icon">$</span>
          <span>Profit</span>
        </a>
        <a className={navClass('marketing')} href="#marketing">
          <span className="icon">◎</span>
          <span>Menu</span>
        </a>
        <a className={navClass('employees')} href="#employees">
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

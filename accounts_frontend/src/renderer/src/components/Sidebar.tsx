import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CreditCard,
  BookOpen,
  BarChart2,
  LogOut,
  Settings,
  LucideIcon
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  exact?: boolean
}

const NAV: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/products', icon: Package, label: 'Products' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/payments', icon: CreditCard, label: 'Payments' },
  { to: '/ledger', icon: BookOpen, label: 'Ledger' },
  { to: '/reports', icon: BarChart2, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' }
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  const initials = (user?.full_name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleLogout = () => {
    // Blur the button before showing the confirm dialog to clear active focus
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    if (window.confirm('Are you sure you want to log out?')) {
      // Defer the state change / unmounting until the next tick.
      // This lets the native confirm dialog fully close and allows
      // the Electron window to recover focus before unmounting.
      setTimeout(() => {
        logout()
      }, 50)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sb-section-label">Navigation</div>

      <nav className="sb-nav">
        {NAV.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
          >
            <Icon size={17} className="sb-icon" strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sb-user-name">{user?.full_name || 'User'}</div>
            <div className="sb-user-role">{user?.role || '—'}</div>
          </div>
          <button className="sb-logout-btn" onClick={handleLogout} title="Logout">
            <LogOut size={13} color="#2D4060" />
          </button>
        </div>
      </div>
    </aside>
  )
}

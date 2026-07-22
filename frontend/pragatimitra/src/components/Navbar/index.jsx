import { NavLink } from 'react-router-dom'
import './Navbar.css'

const NAV_LINKS = [
  { to: '/',          label: 'Home' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/reports',   label: 'Reports' },
  // ↓ Add new nav items here
]

export default function Navbar() {
  return (
    <header className="navbar">
      <span className="navbar__brand">PragatiMitra</span>
      <nav className="navbar__nav">
        {NAV_LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              isActive ? 'navbar__link navbar__link--active' : 'navbar__link'
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <NavLink to="/login" className="navbar__cta">Login</NavLink>
    </header>
  )
}

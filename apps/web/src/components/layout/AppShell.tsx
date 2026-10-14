import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronDown,
  CircleUserRound,
  Handshake,
  Home,
  Map,
  Settings,
  Truck,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { config } from '../../config';
import { useSession } from '../../auth/SessionContext';
import { BrandWordmark } from '../BrandWordmark';
import './AppShell.css';

const navItems = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/opportunities', label: 'Oportunidades', icon: Handshake },
  { to: '/coverage', label: 'Cobertura', icon: Map },
  { to: '/suppliers', label: 'Proveedores', icon: Building2 },
  { to: '/deliveries', label: 'Service Delivery Office', icon: Truck },
  { to: '/profitability', label: 'Inteligencia', icon: BarChart3 },
  { to: '/admin', label: 'Administración', icon: Settings },
];

export function AppShell() {
  const location = useLocation();
  const { user } = useSession();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar__brand" aria-label="linkpartner · Inicio">
          <BrandWordmark />
          <BrandWordmark compact />
        </Link>

        <nav className="sidebar__nav" aria-label="Navegación principal">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <strong>Link Partner</strong>
          <span>Conectividad que hace posible más negocios.</span>
          <code>v0.2.0</code>
        </div>
      </aside>

      <div className="app-shell__body">
        <header className="topbar">
          <a className="topbar__hub" href={config.hubUrl}>
            <ArrowLeft size={17} />
            Volver al Hub
          </a>
          <div className="topbar__spacer" />
          <div className="topbar__org">
            <Building2 size={17} />
            <span>{user.organization}</span>
          </div>
          <div className="topbar__user">
            <CircleUserRound size={28} strokeWidth={1.5} />
            <span><strong>{user.displayName}</strong><small>Operaciones</small></span>
            <ChevronDown size={15} />
          </div>
          <Link className="button button--primary topbar__cx" to="/cx">
            <CircleUserRound size={17} aria-hidden="true" />
            <span>Link Partner CX</span>
          </Link>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

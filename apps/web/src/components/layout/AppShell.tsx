import {
  ArrowLeft,
  BarChart3,
  Building2,
  ChevronDown,
  CircleUserRound,
  Handshake,
  Home,
  Map,
  Plus,
  Settings,
  Truck,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { config } from '../../config';
import { useSession } from '../../auth/SessionContext';
import './AppShell.css';

const navItems = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/opportunities', label: 'Oportunidades', icon: Handshake },
  { to: '/coverage', label: 'Cobertura', icon: Map },
  { to: '/suppliers', label: 'Proveedores', icon: Building2 },
  { to: '/deliveries', label: 'Entregas', icon: Truck },
  { to: '/profitability', label: 'Rentabilidad', icon: BarChart3 },
  { to: '/admin', label: 'Administración', icon: Settings },
];

function LinkPartnerMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSession();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <LinkPartnerMark />
          <strong>Link<br />Partner</strong>
        </div>

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
          <code>v0.1.1</code>
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
          <button className="button button--primary topbar__new" type="button" onClick={() => navigate('/opportunities?create=1')}>
            <Plus size={17} />
            <span>Nueva oportunidad</span>
          </button>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

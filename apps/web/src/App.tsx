import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';

const OpportunityDetailPage = lazy(() => import('./pages/OpportunityDetailPage').then((module) => ({ default: module.OpportunityDetailPage })));
const CoveragePage = lazy(() => import('./pages/CoveragePage').then((module) => ({ default: module.CoveragePage })));
const SuppliersPage = lazy(() => import('./pages/SuppliersPage').then((module) => ({ default: module.SuppliersPage })));
const DeliveriesPage = lazy(() => import('./pages/DeliveriesPage').then((module) => ({ default: module.DeliveriesPage })));
const DeliveryProjectPage = lazy(() => import('./pages/DeliveryProjectPage').then((module) => ({ default: module.DeliveryProjectPage })));
const ProfitabilityPage = lazy(() => import('./pages/ProfitabilityPage').then((module) => ({ default: module.ProfitabilityPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((module) => ({ default: module.AdminPage })));

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="page"><div className="panel empty-note">Cargando vista…</div></div>}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="opportunities" element={<OpportunitiesPage />} />
        <Route path="opportunities/:id" element={<Deferred><OpportunityDetailPage /></Deferred>} />
        <Route path="coverage" element={<Deferred><CoveragePage /></Deferred>} />
        <Route path="suppliers" element={<Deferred><SuppliersPage /></Deferred>} />
        <Route path="deliveries" element={<Deferred><DeliveriesPage /></Deferred>} />
        <Route path="deliveries/:id" element={<Deferred><DeliveryProjectPage /></Deferred>} />
        <Route path="profitability" element={<Deferred><ProfitabilityPage /></Deferred>} />
        <Route path="admin" element={<Deferred><AdminPage /></Deferred>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

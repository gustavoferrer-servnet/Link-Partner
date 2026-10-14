import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import type { DigitalConsultationSummary } from '../types';
import { consultationDate, consultationStatuses, coverageStatuses } from '../lib/consultations';
import { Status } from './ui/Status';
import './DigitalConsultations.css';

const EMPTY: DigitalConsultationSummary[] = [];
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const PAGE_SIZE = 25;
export function DigitalConsultations() {
  const { token } = useSession();
  const records = useQuery({ queryKey: ['digital-consultations', token], queryFn: ({ signal }) => apiGet<DigitalConsultationSummary[]>('/digital-consultations', token, signal), refetchInterval: 30000 });
  const items = records.data ?? EMPTY;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const search = normalize(query.trim());
    return items.filter(item => (status === 'all' || item.qualificationStatus === status) && (channel === 'all' || item.channel === channel) && normalize([item.code, item.opportunityId, item.fullName, item.email, item.company, item.customerReference, item.address, item.city, item.product, ...(item.addresses ?? [])].join(' ')).includes(search));
  }, [items, query, status, channel]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  return <div className="section-stack digital-consultations">
    <p className="consultation-intro">Todas las consultas de cobertura de Link Partner CX, vinculadas a su oportunidad DIGITAL. Incluye solicitudes sin cobertura y pendientes de validación.</p>
    <div className="summary-grid">
      <div className="panel summary-card"><span>Consultas CX</span><strong>{items.length}</strong><small>Guardadas en Link Partner</small></div>
      <div className="panel summary-card summary-card--blue"><span>Prefactibles</span><strong>{items.filter(item => item.coverageStatus === 'AVAILABLE').length}</strong><small>Cobertura preliminar</small></div>
      <div className="panel summary-card summary-card--accent"><span>Por validar</span><strong>{items.filter(item => item.coverageStatus === 'PENDING' || item.coverageStatus === 'ERROR').length}</strong><small>Revisión pendiente</small></div>
      <div className="panel summary-card summary-card--red"><span>Sin cobertura</span><strong>{items.filter(item => item.coverageStatus === 'NO_COVERAGE').length}</strong><small>Revisar alternativas</small></div>
    </div>
    <section className="panel" aria-labelledby="digital-consultations-title">
      <div className="panel__header consultation-list-heading"><div><h2 id="digital-consultations-title">Consultas CX</h2><small>{filtered.length} de {items.length} consultas</small></div><button className="button" disabled={records.isFetching} onClick={() => void records.refetch()}><RefreshCw size={15} />{records.isFetching ? 'Actualizando…' : 'Actualizar'}</button></div>
      <div className="consultation-filters">
        <label className="control control--search"><Search size={15} /><input aria-label="Buscar consultas CX" placeholder="Código, nombre, email, empresa o dirección" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
        <select className="control" aria-label="Estado de consulta" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos los estados</option>{Object.entries(consultationStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className="control" aria-label="Canal de consulta" value={channel} onChange={event => { setChannel(event.target.value); setPage(1); }}><option value="all">Todos los canales</option><option value="ENTERPRISE">Enterprise</option><option value="WHOLESALE">Wholesale</option></select>
      </div>
      {records.isError ? <p className="consultation-empty" role="alert">No fue posible cargar las consultas. Usa Actualizar para intentar de nuevo.</p> : records.isPending ? <p className="consultation-empty" role="status">Cargando consultas guardadas…</p> : <>
        <div className="table-wrap"><table className="data-table consultation-table"><thead><tr><th>Código / Fecha</th><th>Contacto / Empresa</th><th>Dirección / Servicio</th><th>Canal</th><th>Cobertura</th><th>Estado</th><th aria-label="Acción" /></tr></thead><tbody>{filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE).map(item => <tr key={item.code}>
          <td><Link className="consultation-code" to={`/opportunities/${encodeURIComponent(item.opportunityId)}`}><code>{item.code}</code></Link><small>{consultationDate(item.createdAt)}</small></td>
          <td><strong>{item.fullName || 'Nombre sin capturar'}</strong><small>{item.email || 'Email sin capturar'}</small><span>{item.company || 'Empresa sin capturar'}</span></td>
          <td><strong>{(item.locationCount ?? 1) > 1 ? `${item.locationCount} localidades · ${item.address}` : item.address}</strong><small>{item.product} · {item.capacitiesMbps && item.capacitiesMbps.length > 1 ? `${item.capacitiesMbps.join(' · ')} Mbps por servicio` : `${item.capacityMbps} Mbps`}</small>{item.customerReference ? <small>Referencia: {item.customerReference}</small> : null}</td>
          <td>{item.channel === 'ENTERPRISE' ? 'Enterprise' : 'Wholesale'}</td><td>{coverageStatuses[item.coverageStatus]}{item.carrierRedundancyRequested ? <small className="consultation-redundancy-label">Redundancia de carrier solicitada</small> : null}</td><td><Status>{consultationStatuses[item.qualificationStatus] || item.qualificationStatus}</Status></td>
          <td><Link className="consultation-open" aria-label={`Ver consulta ${item.code}`} to={`/opportunities/${encodeURIComponent(item.opportunityId)}`}><ChevronRight size={18} /></Link></td>
        </tr>)}</tbody></table></div>
        {!filtered.length ? <p className="consultation-empty">{items.length ? 'No hay consultas que coincidan con estos filtros.' : 'Todavía no hay consultas de CX guardadas.'}</p> : <div className="consultation-pagination"><span>Página {current} de {pages}</span><button className="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Anterior</button><button className="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Siguiente</button></div>}
      </>}
    </section>
  </div>;
}

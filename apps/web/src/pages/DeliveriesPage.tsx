import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronRight, Filter, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Status } from '../components/ui/Status';
import { config } from '../config';
import type { DeliveryProject } from '../types';
import './DeliveriesPage.css';

const EMPTY_PROJECTS: DeliveryProject[] = [];
const date = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

function showDate(value: string | null) {
  return value ? date.format(new Date(`${value}T12:00:00`)) : 'No disponible';
}

export function DeliveriesPage() {
  const navigate = useNavigate();
  const { token } = useSession();
  const [query, setQuery] = useState('');
  const [flow, setFlow] = useState('all');
  const [schedule, setSchedule] = useState('all');
  const projectsQuery = useQuery({
    queryKey: ['delivery-projects'],
    queryFn: ({ signal }) => apiGet<DeliveryProject[]>('/delivery-projects', token, signal),
    enabled: config.dataMode === 'api',
  });
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const filtered = useMemo(() => projects.filter((project) => {
    const text = `${project.id} ${project.opportunityId} ${project.client} ${project.site} ${project.provider || ''} ${project.serviceDeliveryOwner}`.toLocaleLowerCase('es-MX');
    return text.includes(query.toLocaleLowerCase('es-MX'))
      && (flow === 'all' || project.flow === flow)
      && (schedule === 'all' || project.scheduleStatus === schedule);
  }), [flow, projects, query, schedule]);

  const metrics = useMemo(() => ({
    onTime: projects.filter((item) => item.scheduleStatus === 'En tiempo').length,
    atRisk: projects.filter((item) => item.scheduleStatus === 'En riesgo').length,
    delayed: projects.filter((item) => item.scheduleStatus === 'Retrasado').length,
    openDeviations: projects.reduce((total, item) => total + item.deviations.filter((deviation) => deviation.status !== 'Resuelto').length, 0),
  }), [projects]);

  return (
    <div className="page section-stack delivery-portfolio">
      <header className="page-header">
        <div className="page-header__copy"><h1>Service Delivery Office</h1><p>CARTERA · ACTIVIDADES · GANTT · DESVÍOS · EVIDENCIAS · CIERRES</p></div>
        <div className="page-header__actions"><span className="sync-note"><CalendarClock size={15} /> WSAS: adaptador simulado</span></div>
      </header>

      <div className="summary-grid">
        <div className="panel summary-card summary-card--blue"><span>En tiempo</span><strong>{metrics.onTime}</strong><small>Contra compromiso vigente</small></div>
        <div className="panel summary-card summary-card--accent"><span>En riesgo</span><strong>{metrics.atRisk}</strong><small>Requieren seguimiento</small></div>
        <div className="panel summary-card summary-card--red"><span>Retrasados</span><strong>{metrics.delayed}</strong><small>Pronóstico posterior</small></div>
        <div className="panel summary-card"><span>Desvíos abiertos</span><strong>{metrics.openDeviations}</strong><small>Riesgos, dependencias y bloqueos</small></div>
      </div>

      <section className="panel">
        <div className="panel__header delivery-filters">
          <div className="filters">
            <label className="control control--search"><Search size={14} /><input aria-label="Buscar proyecto" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Proyecto, cliente, sitio o responsable" /></label>
            <label className="select-control"><Filter size={14} /><select aria-label="Filtrar por flujo" value={flow} onChange={(event) => setFlow(event.target.value)}><option value="all">Todos los flujos</option><option>Servnet</option><option>Terceros</option><option>Híbrido</option></select></label>
            <select className="control" aria-label="Filtrar por calendario" value={schedule} onChange={(event) => setSchedule(event.target.value)}><option value="all">Todo el calendario</option><option>En tiempo</option><option>En riesgo</option><option>Retrasado</option></select>
          </div>
          <span>{filtered.length} proyectos</span>
        </div>
        {projectsQuery.isLoading ? <div className="empty-note">Cargando cartera operativa…</div> : projectsQuery.isError ? <div className="empty-note text-danger">No fue posible consultar Service Delivery.</div> : (
          <div className="table-wrap"><table className="data-table delivery-table"><thead><tr><th>Proyecto / cliente</th><th>Referencias</th><th>Flujo</th><th>Delivery Manager</th><th>Etapa</th><th>Compromiso</th><th>Pronóstico</th><th>Calendario</th><th>Próxima acción</th><th /></tr></thead><tbody>{filtered.map((project) => (
            <tr key={project.id} tabIndex={0} onClick={() => navigate(`/deliveries/${project.id}`)} onKeyDown={(event) => event.key === 'Enter' && navigate(`/deliveries/${project.id}`)}>
              <td><strong>{project.id}</strong><small>{project.client} · {project.site}</small></td>
              <td><code>{project.opportunityId}</code><small>{project.externalRefs.wsasRequestId || 'Sin ticket WSAS'}</small></td>
              <td><span className={`flow-chip flow-chip--${project.flow.toLowerCase().replace('í', 'i')}`}>{project.flow}</span><small>{project.infrastructure}{project.provider ? ` · ${project.provider}` : ''}</small></td>
              <td>{project.serviceDeliveryOwner}</td>
              <td><strong>{project.stage}</strong><small>{project.operationalStatus}</small></td>
              <td>{showDate(project.currentCommitment)}{project.currentCommitment !== project.originalCommitment ? <small className="baseline-change"><TriangleAlert size={11} /> Base {showDate(project.originalCommitment)}</small> : null}</td>
              <td>{showDate(project.forecastDate)}</td>
              <td><Status>{project.scheduleStatus}</Status></td>
              <td className="next-action">{project.nextAction}</td>
              <td><ChevronRight size={15} /></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>
    </div>
  );
}

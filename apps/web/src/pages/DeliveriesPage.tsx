import { CalendarClock, Filter } from 'lucide-react';
import { deliveries } from '../data/demo';
import { Status } from '../components/ui/Status';

export function DeliveriesPage() {
  return (
    <div className="page section-stack">
      <header className="page-header"><div className="page-header__copy"><h1>Service Delivery</h1><p>HITOS · FECHAS COMPROMETIDAS · BLOQUEOS · EVIDENCIAS</p></div><div className="page-header__actions"><button className="button" type="button"><Filter size={15} /> Filtros</button></div></header>
      <div className="summary-grid"><div className="panel summary-card summary-card--blue"><span>En tiempo</span><strong>1</strong><small>20% de la cartera</small></div><div className="panel summary-card summary-card--accent"><span>En riesgo</span><strong>2</strong><small>Revisar pronóstico</small></div><div className="panel summary-card summary-card--red"><span>Bloqueados</span><strong>1</strong><small>3 días acumulados</small></div><div className="panel summary-card"><span>Entrega promedio</span><strong>21 d</strong><small>Objetivo 18 días</small></div></div>
      <section className="panel"><div className="panel__header"><h2>Cartera de proyectos</h2><span><CalendarClock size={15} /> Actualizado hace 8 min</span></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Proyecto</th><th>Oportunidad</th><th>Sitio</th><th>Ejecutor</th><th>Fase actual</th><th>Pronóstico</th><th>Estado</th><th>Bloqueo</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td><code>{delivery.id}</code></td><td><code>{delivery.opportunityId}</code></td><td><strong>{delivery.site}</strong></td><td>{delivery.executor}</td><td>{delivery.phase}</td><td>{delivery.forecastDate}</td><td><Status>{delivery.status}</Status></td><td>{delivery.blocker || '—'}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}

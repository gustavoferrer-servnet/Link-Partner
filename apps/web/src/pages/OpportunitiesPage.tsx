import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import type { Opportunity } from '../types';
import { config } from '../config';
import { opportunities } from '../data/demo';
import { OpportunityTable } from '../components/OpportunityTable';
import { DigitalConsultations } from '../components/DigitalConsultations';
import { useSearchParams } from 'react-router-dom';

export function OpportunitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showConsultations = searchParams.get('view') === 'consultas';
  const { token } = useSession();
  const records = useQuery({ queryKey: ['opportunities', token], queryFn: ({ signal }) => apiGet<Opportunity[]>('/opportunities', token, signal) });
  const items = records.data ?? (config.dataMode === 'demo' ? opportunities : []);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const filtered = useMemo(() => items.filter((item) => {
    const matchesText = `${item.id} ${item.consultationCode || ''} ${item.siteName} ${item.city} ${item.address} ${item.prefeasibility?.createdBy?.displayName || ''} ${item.prefeasibility?.createdBy?.email || ''}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (level === 'all' || item.level === level);
  }), [items, query, level]);

  return (
    <div className="page section-stack">
      <header className="page-header">
        <div className="page-header__copy"><h1>Oportunidades</h1><p>SERVNET COMPRA Y VENDE · CASCADA P1 → P2 → P3</p></div>
        {!showConsultations ? <div className="page-header__actions"><button className="button button--primary" type="button"><Plus size={16} /> Nueva oportunidad</button></div> : null}
      </header>
      <div className="consultation-views" role="group" aria-label="Vista de oportunidades"><button className="button" aria-pressed={!showConsultations} onClick={() => { const next = new URLSearchParams(searchParams); next.delete('view'); setSearchParams(next); }}>Cartera de oportunidades</button><button className="button" aria-pressed={showConsultations} onClick={() => { const next = new URLSearchParams(searchParams); next.set('view', 'consultas'); setSearchParams(next); }}>Consultas CX</button></div>
      {showConsultations ? <DigitalConsultations /> : <><div className="summary-grid">
        <div className="panel summary-card summary-card--blue"><span>P1 · Red Servnet</span><strong>{items.filter(item => item.level === 'P1').length}</strong><small>En red propia</small></div>
        <div className="panel summary-card"><span>P2 · Gestionado</span><strong>{items.filter(item => item.level === 'P2').length}</strong><small>Gestionado</small></div>
        <div className="panel summary-card summary-card--accent"><span>P3 · Marketplace</span><strong>{items.filter(item => item.level === 'P3').length}</strong><small>Marketplace</small></div>
        <div className="panel summary-card summary-card--red"><span>Bloqueadas</span><strong>{items.filter(item => item.status === 'Bloqueada').length}</strong><small>Requiere revisión</small></div>
      </div>
      {records.isError ? <p role="alert">No fue posible cargar oportunidades del API.</p> : null}
      <section className="panel">
        <div className="panel__header">
          <div className="filters">
            <label className="control control--search"><Search size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar oportunidad o sitio" style={{ border: 0, background: 'transparent', outline: 0 }} /></label>
            <select className="control" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Todos los niveles</option><option>P1</option><option>P2</option><option>P3</option></select>
          </div>
          <span>{filtered.length} resultados</span>
        </div>
        <OpportunityTable items={filtered} />
      </section></>}
    </div>
  );
}

import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { opportunities } from '../data/demo';
import { OpportunityTable } from '../components/OpportunityTable';

export function OpportunitiesPage() {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('all');
  const filtered = useMemo(() => opportunities.filter((item) => {
    const matchesText = `${item.id} ${item.siteName} ${item.city}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (level === 'all' || item.level === level);
  }), [query, level]);

  return (
    <div className="page section-stack">
      <header className="page-header">
        <div className="page-header__copy"><h1>Oportunidades</h1><p>SERVNET COMPRA Y VENDE · CASCADA P1 → P2 → P3</p></div>
        <div className="page-header__actions"><button className="button button--primary" type="button"><Plus size={16} /> Nueva oportunidad</button></div>
      </header>
      <div className="summary-grid">
        <div className="panel summary-card summary-card--blue"><span>P1 · Red Servnet</span><strong>3</strong><small>3 enlaces en red propia</small></div>
        <div className="panel summary-card"><span>P2 · Gestionado</span><strong>2</strong><small>Con contrato y SLA</small></div>
        <div className="panel summary-card summary-card--accent"><span>P3 · Marketplace</span><strong>1</strong><small>RFP abierto</small></div>
        <div className="panel summary-card summary-card--red"><span>Brecha SLA</span><strong>1</strong><small>Requiere excepción</small></div>
      </div>
      <section className="panel">
        <div className="panel__header">
          <div className="filters">
            <label className="control control--search"><Search size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar oportunidad o sitio" style={{ border: 0, background: 'transparent', outline: 0 }} /></label>
            <select className="control" value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">Todos los niveles</option><option>P1</option><option>P2</option><option>P3</option></select>
          </div>
          <span>{filtered.length} resultados</span>
        </div>
        <OpportunityTable items={filtered} />
      </section>
    </div>
  );
}

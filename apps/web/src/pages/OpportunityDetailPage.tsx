import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileCheck2, Layers3, MapPin } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { opportunities, priceHistory, proposals } from '../data/demo';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { CoverageLayerTree } from '../components/CoverageLayerTree';
import { NetworkMap } from '../components/NetworkMap';
import { ResolutionCascade } from '../components/ResolutionCascade';
import { config } from '../config';
import { coverageSourceLayers, type CoverageLayer, type MapLocation } from '../lib/coverageFiles';
import type { Opportunity, SupplierCoverage } from '../types';
import './OpportunityDetailPage.css';

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const EMPTY_COVERAGES: SupplierCoverage[] = [];

export function OpportunityDetailPage() {
  const { id } = useParams();
  const { token } = useSession();
  const usesApi = config.dataMode === 'api';
  const demoOpportunity = useMemo(() => opportunities.find((item) => item.id === id) || opportunities[0], [id]);
  const opportunityQuery = useQuery({
    queryKey: ['opportunity', id],
    queryFn: ({ signal }) => apiGet<Opportunity>(`/opportunities/${encodeURIComponent(id || '')}`, token, signal),
    enabled: usesApi && Boolean(id),
  });
  const coverageQuery = useQuery({
    queryKey: ['supplier-coverages'],
    queryFn: ({ signal }) => apiGet<SupplierCoverage[]>('/supplier-coverages', token, signal),
    enabled: usesApi,
  });
  const opportunity = usesApi ? opportunityQuery.data ?? demoOpportunity : demoOpportunity;
  const supplierCoverages = coverageQuery.data ?? EMPTY_COVERAGES;
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState(proposals[0].id);
  const [justification, setJustification] = useState('');
  const coverageLayers = useMemo<CoverageLayer[]>(() => supplierCoverages.flatMap((coverage) => (
    coverageSourceLayers(coverage).map((layer) => ({ ...layer, visible: !hiddenLayerIds.has(layer.id) }))
  )), [hiddenLayerIds, supplierCoverages]);
  const siteLocation = useMemo<MapLocation | null>(() => (
    typeof opportunity.latitude === 'number' && typeof opportunity.longitude === 'number'
      ? { lat: opportunity.latitude, lng: opportunity.longitude, label: opportunity.siteId }
      : null
  ), [opportunity.latitude, opportunity.longitude, opportunity.siteId]);

  function toggleLayerIds(layerIds: string[]) {
    setHiddenLayerIds((current) => {
      const next = new Set(current);
      const allHidden = layerIds.every((layerId) => next.has(layerId));
      for (const layerId of layerIds) {
        if (allHidden) next.delete(layerId);
        else next.add(layerId);
      }
      return next;
    });
  }

  return (
    <div className="page section-stack opportunity-detail">
      <Link className="back-link" to="/opportunities"><ArrowLeft size={15} /> Volver a oportunidades</Link>
      <header className="page-header">
        <div className="page-header__copy"><h1>{opportunity.id}</h1><p>PUBLICADA POR {opportunity.origin.toUpperCase()} &nbsp;|&nbsp; SITIO {opportunity.siteId} &nbsp;|&nbsp; EN EVALUACIÓN</p></div>
        <div className="page-header__actions"><button className="button" type="button">Comparar propuestas</button><button className="button button--primary" type="button">Adjudicar</button></div>
      </header>

      <div className="split-layout">
        <div className="section-stack">
          <section className="panel site-summary">
            <div className="site-summary__copy"><MapPin size={22} /><div><h2>{opportunity.siteName}</h2><p>{opportunity.address}<br />{opportunity.city}</p><dl><div><dt>Capacidad</dt><dd>{opportunity.capacity}</dd></div><div><dt>Servicio</dt><dd>{opportunity.service}</dd></div><div><dt>SLA objetivo</dt><dd>{opportunity.clientSla}</dd></div><div><dt>Entrega</dt><dd>{opportunity.deliveryDate}</dd></div></dl></div></div>
            <div className="opportunity-coverage-map">
              <NetworkMap compact coverageLayers={coverageLayers} focusLocation={siteLocation} />
              <div className="opportunity-coverage-controls">
                <span><Layers3 size={14} /> Cobertura por proveedor</span>
                {coverageQuery.isLoading ? <small>Cargando coberturas…</small> : supplierCoverages.length === 0 ? <small>Sin coberturas cargadas</small> : <CoverageLayerTree compact coverages={supplierCoverages} hiddenLayerIds={hiddenLayerIds} onToggleLayerIds={toggleLayerIds} />}
              </div>
            </div>
          </section>

          <ResolutionCascade active={opportunity.level} />

          <section className="panel">
            <div className="panel__header"><h2>Propuestas recibidas</h2><span>{proposals.length} respuestas normalizadas</span></div>
            <div className="table-wrap"><table className="data-table proposal-table"><thead><tr><th /><th>Proveedor</th><th>MRC</th><th>NRC</th><th>Entrega</th><th>Disponibilidad</th><th>MTTR</th><th>Scorecard</th><th>Score total</th></tr></thead><tbody>{proposals.map((proposal) => <tr key={proposal.id} className={selected === proposal.id ? 'is-selected' : ''} onClick={() => setSelected(proposal.id)}><td><input type="radio" name="proposal" checked={selected === proposal.id} onChange={() => setSelected(proposal.id)} /></td><td><strong>{proposal.supplier}</strong><small>{proposal.kind}</small>{proposal.recommended ? <em>Propuesta recomendada</em> : null}</td><td>{money.format(proposal.mrc)}</td><td>{money.format(proposal.nrc)}</td><td>{proposal.deliveryDays} días</td><td>{proposal.availability}%</td><td className={proposal.mttrHours > 4 ? 'text-danger' : ''}>{proposal.mttrHours} h</td><td>{proposal.scorecard}/100</td><td><strong>{proposal.totalScore}/100</strong></td></tr>)}</tbody></table></div>
          </section>

          <section className="panel activity-panel">
            <div className="panel__header"><h2>Actividad de la oportunidad</h2></div>
            <div className="activity-timeline">
              <p><time>05 oct 2026 09:12</time><strong>Laura Rodríguez</strong><span>Se recibió propuesta de Cirion</span></p>
              <p><time>04 oct 2026 16:40</time><strong>Ana Torres</strong><span>Se recibió propuesta de Axtel</span></p>
              <p><time>03 oct 2026 11:20</time><strong>Sistema</strong><span>Se validó cobertura P1</span></p>
              <p><time>02 oct 2026 10:24</time><strong>Ana Torres</strong><span>Oportunidad publicada</span></p>
            </div>
          </section>
        </div>

        <aside className="section-stack">
          <section className="panel">
            <div className="panel__header"><h2>SLA espejo</h2><span className="legend-inline"><i /> En rango <i /> Brecha</span></div>
            <table className="sla-table"><thead><tr><th>Parámetro</th><th>Cliente</th><th>Proveedor</th><th /></tr></thead><tbody><tr><td>Disponibilidad</td><td>≥ 99.90%</td><td>99.95%</td><td><CheckCircle2 size={16} /></td></tr><tr><td>Latencia</td><td>≤ 30 ms</td><td>28 ms</td><td><CheckCircle2 size={16} /></td></tr><tr><td>Jitter</td><td>≤ 10 ms</td><td>8 ms</td><td><CheckCircle2 size={16} /></td></tr><tr className="has-gap"><td>MTTR</td><td>≤ 4 horas</td><td>6 horas</td><td><AlertTriangle size={16} /></td></tr></tbody></table>
            <div className="warning"><AlertTriangle size={18} /><span>El MTTR ofrecido no cumple el objetivo del cliente. Requiere una mejora o una excepción aprobada.</span></div>
          </section>

          <section className="panel award-checklist">
            <div className="panel__header"><h2>Lista de verificación</h2></div>
            {['Contrato marco vigente', 'SLA estructurado', 'Matriz de escalación', 'Poder legal del aprobador'].map((label) => <label key={label}><input type="checkbox" defaultChecked={label !== 'Poder legal del aprobador'} /><FileCheck2 size={17} /><span>{label}</span></label>)}
            <label className="justification"><span>Justificación obligatoria</span><textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Motivo de la selección y notas…" rows={4} /><small>{justification.length}/500</small></label>
          </section>

          <section className="panel price-chart">
            <div className="panel__header"><h2>Histórico de precios MRC</h2></div>
            <div className="panel__body"><ResponsiveContainer width="100%" height={210}><AreaChart data={priceHistory}><CartesianGrid stroke="rgba(47,42,35,.12)" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Area type="monotone" dataKey="p75" stroke="none" fill="#d6e4df" /><Area type="monotone" dataKey="p25" stroke="none" fill="#f8f5ef" /><Line type="monotone" dataKey="average" stroke="#157a78" strokeWidth={2} dot={{ r: 2 }} /></AreaChart></ResponsiveContainer></div>
          </section>
        </aside>
      </div>
    </div>
  );
}

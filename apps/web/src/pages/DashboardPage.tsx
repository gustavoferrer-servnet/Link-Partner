import { useMemo, useState } from 'react';
import { MapPin, SlidersHorizontal } from 'lucide-react';
import { useSession } from '../auth/SessionContext';
import { config } from '../config';
import { useSupplierCoverages } from '../lib/useSupplierCoverages';
import { coverageSourceLayers, type MapLocation } from '../lib/coverageFiles';
import { deliveries, opportunities } from '../data/demo';
import { NetworkMap } from '../components/NetworkMap';
import { ResolutionCascade } from '../components/ResolutionCascade';
import { OpportunityTable } from '../components/OpportunityTable';
import { Status } from '../components/ui/Status';

export function DashboardPage() {
  const { token } = useSession();
  const coverageQuery = useSupplierCoverages(token, config.dataMode === 'api');
  const coverageLayers = useMemo(() => coverageQuery.data?.flatMap(coverageSourceLayers) ?? [], [coverageQuery.data]);
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__copy">
          <h1>Centro de operación</h1>
          <p>05 OCT 2026 &nbsp;|&nbsp; 8 OPORTUNIDADES ACTIVAS &nbsp;|&nbsp; 5 ENTREGAS EN CURSO</p>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="dashboard-map"><NetworkMap coverageLayers={coverageLayers} coverageLoading={coverageQuery.isLoading} coverageError={coverageQuery.isError} onCoverageRetry={() => { void coverageQuery.refetch(); }} focusLocation={selectedLocation} onLocationSelect={setSelectedLocation} /></div>

        <section className="panel site-insight">
          <div className="site-insight__top">
            <MapPin className="site-insight__pin" size={24} />
            <div><h2>SIT-0874</h2><p>Av. Insurgentes Sur 1263<br />Del Valle, Benito Juárez, CDMX</p></div>
          </div>
          <div className="availability">
            <div className="availability__item availability__item--available"><strong>OnNet</strong><span><i /> Disponible</span><span>Red Servnet · 0.6 km</span></div>
            <div className="availability__item availability__item--feasible"><strong>NearNet</strong><span><i /> Factible</span><span>Red Servnet · 2.4 km</span></div>
            <div className="availability__item"><strong>OffNet</strong><span><i /> No disponible</span><span>3 carriers con precio</span></div>
          </div>
          <div className="site-insight__choice">
            <h3>Opciones de aprovisionamiento</h3>
            <label className="choice-row"><input type="radio" name="route" defaultChecked /><span><strong>Red Servnet</strong><small>Entrega estimada: 15 días hábiles</small></span></label>
            <label className="choice-row"><input type="radio" name="route" /><span><strong>Proveedor gestionado</strong><small>Mejor costo vigente: $48,000 MRC</small></span></label>
            <label className="choice-row"><input type="radio" name="route" /><span><strong>Marketplace</strong><small>Publicar nueva RFP</small></span></label>
          </div>
        </section>

        <div className="dashboard-cascade"><ResolutionCascade active="P1" /></div>

        <section className="panel dashboard-queue">
          <div className="panel__header"><h2>Cola de oportunidades</h2><button className="button" type="button"><SlidersHorizontal size={14} /> Filtrar</button></div>
          <OpportunityTable items={opportunities} compact />
        </section>

        <div className="dashboard-side">
          <section className="panel">
            <div className="panel__header"><h2>Riesgos de entrega</h2><a href="/deliveries">Ver todos →</a></div>
            <div className="risk-list">
              {deliveries.slice(0, 4).map((delivery) => (
                <div key={delivery.id} className="risk-row"><code>{delivery.id}</code><Status>{delivery.status}</Status><span>{delivery.blocker}</span></div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel__header"><h2>Indicadores operativos</h2></div>
            <div className="metric-strip">
              <div className="metric"><span>Abiertas</span><strong>8</strong><small>+2 esta semana</small></div>
              <div className="metric"><span>SLA en riesgo</span><strong>3</strong><small>37% del total</small></div>
              <div className="metric"><span>Bloqueadas</span><strong>1</strong><small>12% del total</small></div>
              <div className="metric"><span>Margen MRC</span><strong>28%</strong><small>+4 pp vs. mes anterior</small></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, Layers3, MapPin, Route, Settings2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { CoverageLayerTree } from '../components/CoverageLayerTree';
import { NetworkMap } from '../components/NetworkMap';
import { config } from '../config';
import { classifyCoverageBySupplier, coverageSourceLayers, type CoverageLayer, type MapLocation, type SupplierCoverageClassification } from '../lib/coverageFiles';
import type { SupplierCoverage } from '../types';
import './CoveragePage.css';

const EMPTY_COVERAGES: SupplierCoverage[] = [];

export function CoveragePage() {
  const { token } = useSession();
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const coverageQuery = useQuery({
    queryKey: ['supplier-coverages'],
    queryFn: ({ signal }) => apiGet<SupplierCoverage[]>('/supplier-coverages', token, signal),
    enabled: config.dataMode === 'api',
  });
  const supplierCoverages = coverageQuery.data ?? EMPTY_COVERAGES;
  const layers = useMemo<CoverageLayer[]>(() => supplierCoverages.flatMap((coverage) => (
    coverageSourceLayers(coverage).map((layer) => ({ ...layer, visible: !hiddenLayerIds.has(layer.id) }))
  )), [hiddenLayerIds, supplierCoverages]);
  const supplierClassifications = useMemo(
    () => selectedLocation ? classifyCoverageBySupplier(layers, selectedLocation) : [],
    [layers, selectedLocation],
  );

  function toggleLayerIds(layerIds: string[]) {
    setHiddenLayerIds((current) => {
      const next = new Set(current);
      const allHidden = layerIds.every((id) => next.has(id));
      for (const id of layerIds) {
        if (allHidden) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="page section-stack">
      <header className="page-header">
        <div className="page-header__copy">
          <h1>Cobertura y factibilidad</h1>
          <p>OPENSTREETMAP · COBERTURA POR PROVEEDOR · CONSULTA GEOGRÁFICA</p>
        </div>
        <div className="page-header__actions">
          <Link className="button button--primary" to="/suppliers"><Settings2 size={16} /> Administrar coberturas</Link>
        </div>
      </header>

      {coverageQuery.isError ? <div className="coverage-feedback coverage-feedback--error" role="status"><XCircle size={16} /> No fue posible consultar las coberturas de proveedores.</div> : null}

      <div className="split-layout coverage-layout">
        <NetworkMap coverageLayers={layers} focusLocation={selectedLocation} onLocationSelect={setSelectedLocation} />

        <aside className="section-stack coverage-sidebar">
          <section className="panel">
            <div className="panel__header"><h2><MapPin size={17} /> Consulta de sitio</h2></div>
            <div className="panel__body">
              {!selectedLocation ? (
                <div className="coverage-empty-state">
                  <MapPin size={21} />
                  <strong>Selecciona un punto</strong>
                  <span>Haz clic en el mapa o busca una dirección o coordenadas.</span>
                </div>
              ) : (
                <div className="coverage-result">
                  <span className="coverage-result__eyebrow">PUNTO CONSULTADO</span>
                  <strong className="coverage-result__location">{selectedLocation.label}</strong>
                  <code>{selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}</code>
                  <div className="coverage-provider-results">
                    {supplierClassifications.map((result) => <SupplierSiteResult key={result.supplierId} result={result} />)}
                  </div>
                  <p className="coverage-distance-note">Distancia geométrica estimada. OSP confirma la ruta por calle, capacidad y barreras.</p>
                  <button className="button coverage-clear" type="button" onClick={() => setSelectedLocation(null)}>Limpiar punto</button>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header"><h2><Layers3 size={17} /> Capas visibles</h2><span className="coverage-layer-total">{layers.length}</span></div>
            <div className="panel__body coverage-layers">
              {coverageQuery.isLoading ? <div className="coverage-empty-state"><span>Cargando coberturas…</span></div> : supplierCoverages.length === 0 ? (
                <div className="coverage-empty-state"><Layers3 size={21} /><strong>Sin coberturas registradas</strong><span>Carga el KML o KMZ desde Gestión de proveedores.</span></div>
              ) : <CoverageLayerTree coverages={supplierCoverages} hiddenLayerIds={hiddenLayerIds} onToggleLayerIds={toggleLayerIds} />}
            </div>
          </section>

          <section className="panel coverage-help"><div className="panel__body"><strong>Coberturas centralizadas por proveedor.</strong><p>Una cobertura actualizada se refleja en este mapa y en todas las oportunidades. Sólo las capas encendidas participan en la consulta.</p></div></section>
        </aside>
      </div>
    </div>
  );
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return 'Sin distancia disponible';
  if (distanceMeters < 10) return 'Dentro de la geometría de cobertura';
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m a la cobertura más cercana`;
  return `${(distanceMeters / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km a la cobertura más cercana`;
}

function SupplierSiteResult({ result }: { result: SupplierCoverageClassification }) {
  const labels = {
    'on-net': 'On Net',
    'near-net': 'Near Net',
    'off-net': 'Off Net',
    disabled: 'Sin evaluar',
  } as const;
  const icons = {
    'on-net': <CheckCircle2 size={15} />,
    'near-net': <Route size={15} />,
    'off-net': <XCircle size={15} />,
    disabled: <EyeOff size={15} />,
  } as const;

  return (
    <article className={`coverage-provider-result coverage-provider-result--${result.classification}`}>
      <div className="coverage-provider-result__header">
        <i style={{ backgroundColor: result.color }} />
        <strong>{result.supplierName}</strong>
        <span>{icons[result.classification]} {labels[result.classification]}</span>
      </div>
      {result.classification === 'disabled' ? (
        <p>Enciende al menos una capa de este proveedor para evaluarlo.</p>
      ) : (
        <>
          <p><strong>{result.policyLevel}</strong> · {formatDistance(result.distanceMeters)}</p>
          {result.layerName ? <small>{result.sourceFileName ? `${result.sourceFileName} · ` : ''}{result.layerName}</small> : null}
        </>
      )}
    </article>
  );
}

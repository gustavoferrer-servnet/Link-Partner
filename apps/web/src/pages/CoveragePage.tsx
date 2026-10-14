import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, Layers3, MapPin, Route, Settings2, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError, apiSend } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { useSupplierCoverages } from '../lib/useSupplierCoverages';
import { CoverageLayerTree } from '../components/CoverageLayerTree';
import { NetworkMap } from '../components/NetworkMap';
import { config } from '../config';
import { coverageSourceLayers, isPoPLayer, type CoverageLayer, type MapLocation, type SupplierCoverageClassification } from '../lib/coverageFiles';
import { CoverageSupplierMaps } from '../components/CoverageMapVersions';
import { CoverageSaveActions } from '../components/CoverageSaveActions';
import type { CoverageMapVersion, SupplierCoverage } from '../types';
import './CoveragePage.css';
import { useAddressProvider } from '../lib/addressProvider';
import { CoverageTechnologies, CoverageTechnologyNote, type TechnologyCoverage } from '../components/CoverageTechnologies';

const EMPTY_COVERAGES: SupplierCoverage[] = [];
interface CoverageEvaluation {
  technologies: TechnologyCoverage[];
  versions: CoverageMapVersion[];
  suppliers: { supplierId: string; classification: 'on-net' | 'near-net' | 'off-net'; policyLevel: string; distanceMeters: number | null; technologies: TechnologyCoverage[] }[];
}

export function CoveragePage() {
  const queryClient = useQueryClient();
  const addressProvider = useAddressProvider();
  const { token } = useSession();
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(null);
  const [layerVisibility, setLayerVisibility] = useState<Map<string, boolean>>(() => new Map());
  const coverageQuery = useSupplierCoverages(token, config.dataMode === 'api');
  const supplierCoverages = coverageQuery.data ?? EMPTY_COVERAGES;
  const layers = useMemo<CoverageLayer[]>(() => supplierCoverages.flatMap((coverage) => (
    coverageSourceLayers(coverage).map((layer) => ({ ...layer, visible: layerVisibility.get(layer.id) ?? layer.visible }))
  )), [layerVisibility, supplierCoverages]);
  const hiddenLayerIds = useMemo(() => new Set(layers.filter(layer => !layer.visible).map(layer => layer.id)), [layers]);
  const supplierClassifications = useMemo<SupplierCoverageClassification[]>(() => supplierCoverages.map<SupplierCoverageClassification>(coverage => ({
    supplierId: coverage.supplierId, supplierName: coverage.supplierName, color: coverage.color,
    classification: layers.some(layer => layer.supplierId === coverage.supplierId && layer.visible) ? 'off-net' : 'disabled',
    policyLevel: 'Sin evaluar', distanceMeters: null, layerName: null, sourceFileName: null, visibleLayerCount: 0,
  })).filter((item, index, items) => items.findIndex(other => other.supplierId === item.supplierId) === index), [layers, supplierCoverages]);
  const coverageSelection = useMemo(() => {
    const activeSuppliers = new Set(layers.filter(layer => layer.visible).map(layer => layer.supplierId));
    // PoP marker visibility is independent of their use as network references.
    const visibleFeatures = new Set(layers.filter(layer => layer.visible || (activeSuppliers.has(layer.supplierId) && isPoPLayer(layer))).flatMap(layer => layer.data.features));
    return supplierCoverages.flatMap(coverage => coverage.mapVersion?.revisionId ? [{ id: coverage.id, revisionId: coverage.mapVersion.revisionId, featureIndexes: coverage.data.features.flatMap((feature, index) => visibleFeatures.has(feature) ? [index] : []) }] : []).filter(item => item.featureIndexes.length);
  }, [layers, supplierCoverages]);
  const evaluation = useQuery({
    queryKey: ['coverage-evaluation', selectedLocation?.lat, selectedLocation?.lng, coverageSelection, supplierCoverages.map(item => item.updatedAt)],
    queryFn: async ({ signal }) => {
      try { return await apiSend<CoverageEvaluation>('/coverage/check', token, 'POST', { latitude: selectedLocation!.lat, longitude: selectedLocation!.lng, coverageSelection }, signal); }
      catch (error) {
        if (error instanceof ApiError && error.code === 'COVERAGE_REVISION_CONFLICT') await queryClient.invalidateQueries({ queryKey: ['supplier-coverages'] });
        throw error;
      }
    },
    retry: (count, error) => !(error instanceof ApiError && error.code === 'COVERAGE_REVISION_CONFLICT') && count < 2,
    enabled: config.dataMode === 'api' && !!selectedLocation && coverageQuery.isSuccess,
  });

  function toggleLayerIds(layerIds: string[]) {
    setLayerVisibility((current) => {
      const next = new Map(current);
      const allHidden = layerIds.every((id) => hiddenLayerIds.has(id));
      for (const id of layerIds) next.set(id, allHidden);
      return next;
    });
  }

  return (
    <div className="page section-stack">
      <header className="page-header">
        <div className="page-header__copy">
          <h1>Cobertura y factibilidad</h1>
          <p>{addressProvider?.provider === 'google' ? 'GOOGLE MAPS' : addressProvider?.provider === 'photon' ? 'OPENSTREETMAP' : 'CARGANDO PROVEEDOR'} · COBERTURA POR PROVEEDOR · CONSULTA GEOGRÁFICA</p>
        </div>
        <div className="page-header__actions">
          <Link className="button button--primary" to="/suppliers"><Settings2 size={16} /> Administrar coberturas</Link>
        </div>
      </header>

      {coverageQuery.isError ? <div className="coverage-feedback coverage-feedback--error" role="status"><XCircle size={16} /> No fue posible consultar las coberturas de proveedores.</div> : null}

      <div className="split-layout coverage-layout">
        <NetworkMap coverageLayers={layers} coverageLoading={coverageQuery.isLoading} coverageError={coverageQuery.isError} onCoverageRetry={() => { void coverageQuery.refetch(); }} focusLocation={selectedLocation} onLocationSelect={setSelectedLocation} />

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
                  <CoverageSaveActions key={`${selectedLocation.lat}:${selectedLocation.lng}:${layers.filter(layer => layer.visible).map(layer => layer.id).join(',')}:${evaluation.data?.versions.map(version => version.revisionId).join(',')}`} location={selectedLocation} selection={coverageSelection} ready={config.dataMode === 'api' && !!evaluation.data && !evaluation.isFetching && !evaluation.isError && coverageQuery.isSuccess && coverageSelection.length > 0} />
                  <div className="coverage-provider-results">
                    {evaluation.isFetching ? <p role="status">Evaluando coberturas y PoPs en Link Partner…</p> : evaluation.isError ? <p role="alert">{evaluation.error instanceof Error ? evaluation.error.message : 'No fue posible evaluar cobertura. Intenta seleccionar el punto nuevamente.'}</p> : (evaluation.data ? supplierClassifications : []).map(result => {
                      const evaluated = evaluation.data?.suppliers.find(item => item.supplierId === result.supplierId);
                      return <SupplierSiteResult key={result.supplierId} result={result.classification === 'disabled' ? result : { ...result, ...evaluated }} technologies={evaluated?.technologies} versions={evaluation.data?.versions} />;
                    })}
                  </div>
                  <p className="coverage-distance-note">FO: clasificación OnNet/NearNet según el mapa; distancia informativa. MW: factibilidad dentro de la mancha y distancia en línea recta al PoP o punto de red. OSP valida ruta, línea de vista y capacidad.</p>
                  <button className="button coverage-clear" type="button" onClick={() => setSelectedLocation(null)}>Limpiar punto</button>
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header"><h2><Layers3 size={17} /> Capas visibles</h2><span className="coverage-layer-total">{layers.length}</span></div>
            <div className="panel__body coverage-layers">
              {supplierCoverages.length === 0 && coverageQuery.isLoading ? <div className="coverage-empty-state"><span>Cargando coberturas…</span></div> : supplierCoverages.length === 0 ? (
                <div className="coverage-empty-state"><Layers3 size={21} /><strong>Sin coberturas registradas</strong><span>Carga el KML o KMZ desde Gestión de proveedores.</span></div>
              ) : <CoverageLayerTree coverages={supplierCoverages} hiddenLayerIds={hiddenLayerIds} onToggleLayerIds={toggleLayerIds} />}
            </div>
          </section>

          <section className="panel coverage-help"><div className="panel__body"><strong>Coberturas centralizadas por proveedor.</strong><p>Una cobertura actualizada se refleja en este mapa y en todas las oportunidades. Las áreas encendidas participan en la consulta; ocultar los marcadores de PoPs conserva su uso para calcular distancias.</p></div></section>
        </aside>
      </div>
      {selectedLocation && evaluation.data && !evaluation.isFetching && !evaluation.isError ? <section className="panel">
        <div className="panel__header"><h2>Prefactibilidad por tecnología</h2></div>
        <div className="panel__body"><CoverageTechnologies results={evaluation.data.technologies} /><CoverageTechnologyNote /></div>
      </section> : null}
    </div>
  );
}

function formatDistance(distanceMeters: number | null) {
  if (distanceMeters === null) return 'Sin distancia disponible';
  if (distanceMeters < 10) return 'Dentro de la geometría de cobertura';
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m a la cobertura más cercana`;
  return `${(distanceMeters / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km a la cobertura más cercana`;
}

function SupplierSiteResult({ result, technologies, versions }: { result: Omit<SupplierCoverageClassification, 'policyLevel'> & { policyLevel: string }; technologies?: TechnologyCoverage[]; versions?: import('../types').CoverageMapVersion[] }) {
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
          <p><strong>{result.policyLevel}</strong>{!technologies ? ` · ${formatDistance(result.distanceMeters)}` : null}</p>
          {!technologies && result.layerName ? <small>{result.sourceFileName ? `${result.sourceFileName} · ` : ''}{result.layerName}</small> : null}
          {technologies ? <CoverageTechnologies compact results={technologies} /> : null}<CoverageSupplierMaps supplier={result} versions={versions} />
        </>
      )}
    </article>
  );
}

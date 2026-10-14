import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Map, Search } from 'lucide-react';
import type { CoverageLayer, MapLocation } from '../lib/coverageFiles';
import './NetworkMap.css';
import { AddressAutocomplete } from './AddressAutocomplete';
import { useAddressProviderState } from '../lib/addressProvider';
import { config } from '../config';

const GoogleMapCanvas = lazy(() => import('./GoogleMapCanvas'));
const LeafletMapCanvas = lazy(() => import('./LeafletMapCanvas'));
const EMPTY_LAYERS: CoverageLayer[] = [];

interface NetworkMapProps {
  compact?: boolean;
  coverageLayers?: CoverageLayer[];
  coverageLoading?: boolean;
  coverageError?: boolean;
  onCoverageRetry?: () => void;
  locationPin?: boolean;
  ariaLabel?: string;
  focusLocation?: MapLocation | null;
  onLocationSelect?: (location: MapLocation) => void;
}

export function NetworkMap({
  compact = false,
  coverageLayers = EMPTY_LAYERS,
  coverageLoading = false,
  coverageError = false,
  onCoverageRetry,
  locationPin = false,
  ariaLabel = 'Mapa de cobertura',
  focusLocation = null,
  onLocationSelect,
}: NetworkMapProps) {
  const providerQuery = useAddressProviderState();
  const provider = providerQuery.data;
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'not-found' | 'error'>('idle');
  const request = useRef<AbortController | null>(null);
  const selected = useRef<MapLocation | null>(null);
  const [error, setError] = useState('');
  useEffect(() => () => request.current?.abort(), []);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !onLocationSelect) return;

    if (selected.current?.label === trimmedQuery) {
      onLocationSelect(selected.current);
      setSearchState('idle');
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearchState('loading');
    try {
      const response = await fetch(`${config.apiUrl}/locations/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: trimmedQuery, sessionToken: crypto.randomUUID() }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'No fue posible buscar esta ubicación.');
      if (controller.signal.aborted) return;
      const point = body.data.find((option: { token?: string }) => option.token);
      if (!point) { setSearchState('not-found'); return; }
      selected.current = { lat: point.latitude, lng: point.longitude, label: point.address };
      onLocationSelect(selected.current); setQuery(point.address); setSearchState('idle');
    } catch (error) {
      if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : 'No fue posible buscar esta ubicación.'); setSearchState('error'); }
    }
  }

  const visibleLayerCount = coverageLayers.filter((layer) => layer.visible).length;

  return (
    <section className={`network-map${compact ? ' network-map--compact' : ''}`} aria-label={ariaLabel}>
      {!compact ? (
        <div className="network-map__toolbar">
          <form className="map-search" onSubmit={handleSearch}>
            {searchState === 'loading' ? <LoaderCircle className="map-search__spinner" size={16} /> : <Search size={16} />}
            <AddressAutocomplete label="Buscar dirección o coordenadas" placeholder="Dirección, coordenadas o enlace de Google Maps" value={query} onChange={value => { request.current?.abort(); selected.current = null; setQuery(value); setSearchState('idle'); }} onSelect={candidate => { request.current?.abort(); selected.current = { lat: candidate.latitude, lng: candidate.longitude, label: candidate.address }; setQuery(candidate.address); setSearchState('idle'); onLocationSelect?.(selected.current); }} />
            <button type="submit" disabled={!provider || searchState === 'loading'}>Buscar</button>
          </form>
          <span className="map-source"><Map size={14} /> {provider?.provider === 'google' ? 'Google Maps' : provider?.provider === 'photon' ? 'OpenStreetMap' : 'Proveedor por confirmar'}</span>
          <span className="map-layer-count">{visibleLayerCount} {visibleLayerCount === 1 ? 'capa visible' : 'capas visibles'}</span>
        </div>
      ) : null}

      <Suspense fallback={<div className="network-map__loading"><LoaderCircle size={20} /> Cargando mapa…</div>}>
        {!provider ? providerQuery.isError ? <div className="network-map__notice network-map__notice--error" role="alert">No pudimos cargar la configuración de mapas. <button className="button" onClick={() => { void providerQuery.refetch(); }}>Reintentar</button></div> : <div className="network-map__loading" role="status"><LoaderCircle size={20} /> Cargando proveedor de mapas…</div> : provider.provider === 'google' ? <GoogleMapCanvas browserKey={provider.browserKey} coverageLayers={coverageLayers} focusLocation={focusLocation} onLocationSelect={onLocationSelect} /> : <LeafletMapCanvas
          compact={compact}
          locationPin={locationPin}
          coverageLayers={coverageLayers}
          focusLocation={focusLocation}
          onLocationSelect={onLocationSelect}
        />}
      </Suspense>

      {!compact && coverageLoading ? <div className={visibleLayerCount ? 'network-map__notice' : 'network-map__empty'} role="status"><LoaderCircle size={20} /><strong>{visibleLayerCount ? 'Cargando las coberturas restantes…' : 'Cargando coberturas de proveedores…'}</strong></div> : null}
      {!compact && coverageError ? <div className="network-map__notice network-map__notice--error" role="alert">No fue posible cargar las coberturas.{onCoverageRetry ? <button className="button" type="button" onClick={onCoverageRetry}>Reintentar</button> : null}</div> : null}
      {!compact && provider && !coverageLoading && !coverageError && coverageLayers.length === 0 ? (
        <div className="network-map__empty">
          <strong>Mapa listo para recibir coberturas</strong>
          <span>Carga un KML o KMZ, o haz clic para consultar un punto.</span>
        </div>
      ) : null}

      {!compact && searchState === 'not-found' ? <div className="network-map__notice">Selecciona una dirección de las sugerencias o agrega calle, colonia y ciudad.</div> : null}
      {!compact && searchState === 'error' ? <div className="network-map__notice network-map__notice--error">{error}</div> : null}
    </section>
  );
}

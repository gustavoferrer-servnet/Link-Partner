import { lazy, Suspense, useState, type FormEvent } from 'react';
import { LoaderCircle, Map, Search } from 'lucide-react';
import type { CoverageLayer, MapLocation } from '../lib/coverageFiles';
import './NetworkMap.css';

const LeafletMapCanvas = lazy(() => import('./LeafletMapCanvas'));
const EMPTY_LAYERS: CoverageLayer[] = [];

interface NetworkMapProps {
  compact?: boolean;
  coverageLayers?: CoverageLayer[];
  focusLocation?: MapLocation | null;
  onLocationSelect?: (location: MapLocation) => void;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

function coordinateLocation(query: string): MapLocation | null {
  const match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng, label: `${lat.toFixed(6)}, ${lng.toFixed(6)}` };
}

export function NetworkMap({
  compact = false,
  coverageLayers = EMPTY_LAYERS,
  focusLocation = null,
  onLocationSelect,
}: NetworkMapProps) {
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'not-found' | 'error'>('idle');

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !onLocationSelect) return;

    const coordinates = coordinateLocation(trimmedQuery);
    if (coordinates) {
      onLocationSelect(coordinates);
      setSearchState('idle');
      return;
    }

    setSearchState('loading');
    try {
      const params = new URLSearchParams({ format: 'jsonv2', limit: '1', countrycodes: 'mx', q: trimmedQuery });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`OpenStreetMap respondió ${response.status}`);

      const [result] = await response.json() as NominatimResult[];
      if (!result) {
        setSearchState('not-found');
        return;
      }

      onLocationSelect({ lat: Number(result.lat), lng: Number(result.lon), label: result.display_name });
      setSearchState('idle');
    } catch {
      setSearchState('error');
    }
  }

  const visibleLayerCount = coverageLayers.filter((layer) => layer.visible).length;

  return (
    <section className={`network-map${compact ? ' network-map--compact' : ''}`} aria-label="Mapa de cobertura OpenStreetMap">
      {!compact ? (
        <div className="network-map__toolbar">
          <form className="map-search" onSubmit={handleSearch}>
            {searchState === 'loading' ? <LoaderCircle className="map-search__spinner" size={16} /> : <Search size={16} />}
            <input
              aria-label="Buscar dirección o coordenadas"
              placeholder="Dirección o coordenadas: 19.43, -99.13"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit">Buscar</button>
          </form>
          <span className="map-source"><Map size={14} /> OpenStreetMap</span>
          <span className="map-layer-count">{visibleLayerCount} {visibleLayerCount === 1 ? 'capa visible' : 'capas visibles'}</span>
        </div>
      ) : null}

      <Suspense fallback={<div className="network-map__loading"><LoaderCircle size={20} /> Cargando mapa…</div>}>
        <LeafletMapCanvas
          compact={compact}
          coverageLayers={coverageLayers}
          focusLocation={focusLocation}
          onLocationSelect={onLocationSelect}
        />
      </Suspense>

      {!compact && coverageLayers.length === 0 ? (
        <div className="network-map__empty">
          <strong>Mapa listo para recibir coberturas</strong>
          <span>Carga un KML o KMZ, o haz clic para consultar un punto.</span>
        </div>
      ) : null}

      {!compact && searchState === 'not-found' ? <div className="network-map__notice">No encontramos esa ubicación en México.</div> : null}
      {!compact && searchState === 'error' ? <div className="network-map__notice network-map__notice--error">No fue posible consultar OpenStreetMap. También puedes escribir latitud y longitud.</div> : null}
    </section>
  );
}

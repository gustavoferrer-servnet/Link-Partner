import { useEffect, useRef, useState } from 'react';
import { coverageDisplayData, type CoverageLayer, type MapLocation } from '../lib/coverageFiles';
interface Listener { remove(): void }
interface GoogleData {
  addGeoJson(value: unknown): void;
  setMap(map: GoogleMap | null): void;
  setStyle(style: Record<string, unknown>): void;
}
interface GoogleMap {
  setCenter(value: { lat: number; lng: number }): void;
  setZoom(value: number): void;
  addListener(event: string, handler: (event: { latLng?: { lat(): number; lng(): number } }) => void): Listener;
}
interface GoogleMarker { setMap(map: GoogleMap | null): void }
interface MapsAPI {
  Map: new(element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Data: new() => GoogleData;
  Marker: new(options: Record<string, unknown>) => GoogleMarker;
}
declare global { interface Window { google?: { maps: MapsAPI }; linkPartnerMapsReady?: () => void } }
let loading: Promise<MapsAPI> | undefined;
function loadMaps(key: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  loading ??= new Promise<MapsAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { loading = undefined; reject(new Error('Google Maps no respondió')); }, 15000);
    window.linkPartnerMapsReady = () => { clearTimeout(timeout); if (window.google?.maps) resolve(window.google.maps); else reject(new Error('Mapa no disponible')); };
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: 'linkPartnerMapsReady', language: 'es', region: 'MX' })}`;
    script.async = true; script.onerror = () => { clearTimeout(timeout); loading = undefined; reject(new Error('Mapa no disponible')); };
    document.head.appendChild(script);
  });
  return loading;
}
export default function GoogleMapCanvas({ browserKey, coverageLayers, focusLocation, onLocationSelect }: { browserKey: string | null; coverageLayers: CoverageLayer[]; focusLocation: MapLocation | null; onLocationSelect?: (value: MapLocation) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<{ api: MapsAPI; map: GoogleMap } | null>(null);
  const [error, setError] = useState('');
  const drawnLayers = useRef(new Map<string, { data: GoogleData; geometry: CoverageLayer['data']; color: string; attachedMap: GoogleMap | null }>());
  const select = useRef(onLocationSelect); select.current = onLocationSelect;
  useEffect(() => {
    if (!browserKey) { setError('El mapa de Google está pendiente de activación.'); return; }
    let mounted = true; let listener: Listener | undefined;
    loadMaps(browserKey).then(api => {
      if (!mounted || !element.current) return;
      const map = new api.Map(element.current, { center: { lat: 23.6345, lng: -102.5528 }, zoom: 6, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      listener = map.addListener('click', event => { if (event.latLng) { const lat = event.latLng.lat(), lng = event.latLng.lng(); select.current?.({ lat, lng, label: `${lat.toFixed(6)}, ${lng.toFixed(6)}` }); } });
      setInstance({ api, map }); setError('');
    }).catch(() => { if (mounted) setError('No pudimos cargar el mapa de Google. Intenta nuevamente.'); });
    return () => { mounted = false; listener?.remove(); };
  }, [browserKey]);
  useEffect(() => {
    const drawn = drawnLayers.current;
    return () => { drawn.forEach(layer => layer.data.setMap(null)); drawn.clear(); };
  }, [instance]);
  useEffect(() => {
    if (!instance) return;
    const drawn = drawnLayers.current;
    const activeIds = new Set(coverageLayers.map(layer => layer.id));
    for (const [id, layer] of drawn) {
      if (!activeIds.has(id)) { layer.data.setMap(null); drawn.delete(id); }
    }
    for (const layer of coverageLayers) {
      let cached = drawn.get(layer.id);
      // New downloads must not rebuild every geometry already on the map.
      if (cached && (cached.geometry.features.length !== layer.data.features.length || cached.geometry.features.some((feature, index) => feature !== layer.data.features[index]))) {
        cached.data.setMap(null); drawn.delete(layer.id); cached = undefined;
      }
      if (!cached && layer.visible) {
        const data = new instance.api.Data(); data.addGeoJson(coverageDisplayData(layer.data));
        cached = { data, geometry: layer.data, color: '', attachedMap: null }; drawn.set(layer.id, cached);
      }
      if (!cached) continue;
      if (cached.color !== layer.color) { cached.data.setStyle({ strokeColor: layer.color, fillColor: layer.color, fillOpacity: .22, strokeWeight: 2, clickable: false }); cached.color = layer.color; }
      const targetMap = layer.visible ? instance.map : null;
      if (cached.attachedMap !== targetMap) { cached.data.setMap(targetMap); cached.attachedMap = targetMap; }
    }
  }, [instance, coverageLayers]);
  useEffect(() => {
    if (!instance || !focusLocation) return;
    instance.map.setCenter(focusLocation); instance.map.setZoom(14);
    const marker = new instance.api.Marker({ position: focusLocation, map: instance.map, title: focusLocation.label });
    return () => { marker.setMap(null); };
  }, [instance, focusLocation]);
  return <><div className="network-map__leaflet" ref={element} />{error ? <div className="network-map__notice network-map__notice--error" role="status">{error}</div> : null}</>;
}

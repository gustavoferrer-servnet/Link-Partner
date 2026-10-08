import { useEffect, useMemo } from 'react';
import type { Feature, Geometry } from 'geojson';
import L, { type Layer } from 'leaflet';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { CoverageLayer, MapLocation } from '../lib/coverageFiles';
import 'leaflet/dist/leaflet.css';

interface LeafletMapCanvasProps {
  compact: boolean;
  coverageLayers: CoverageLayer[];
  focusLocation: MapLocation | null;
  onLocationSelect?: (location: MapLocation) => void;
}

const MEXICO_CENTER: L.LatLngExpression = [23.6345, -102.5528];
const MEXICO_COVERAGE_EXTENT = {
  south: 14,
  west: -119,
  north: 34,
  east: -85,
};

function visitGeometryPositions(geometry: Geometry | null, visit: (lng: number, lat: number) => void) {
  if (!geometry) return;
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((item) => visitGeometryPositions(item, visit));
    return;
  }

  function visitCoordinates(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      visit(value[0], value[1]);
      return;
    }
    value.forEach(visitCoordinates);
  }

  visitCoordinates(geometry.coordinates);
}

function visibleCoverageBounds(coverageLayers: CoverageLayer[]) {
  let south = Number.POSITIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;

  for (const layer of coverageLayers) {
    if (!layer.visible) continue;
    for (const feature of layer.data.features) {
      visitGeometryPositions(feature.geometry, (lng, lat) => {
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
        // Link Partner operates in Mexico. Outliers in third-party KMZ files must
        // not pull the initial viewport to another continent.
        if (
          lat < MEXICO_COVERAGE_EXTENT.south
          || lat > MEXICO_COVERAGE_EXTENT.north
          || lng < MEXICO_COVERAGE_EXTENT.west
          || lng > MEXICO_COVERAGE_EXTENT.east
        ) return;
        south = Math.min(south, lat);
        west = Math.min(west, lng);
        north = Math.max(north, lat);
        east = Math.max(east, lng);
      });
    }
  }

  if (![south, west, north, east].every(Number.isFinite)) return null;
  return L.latLngBounds([south, west], [north, east]);
}

function featureLabel(feature: Feature) {
  const properties = feature.properties;
  if (!properties) return 'Geometría de cobertura';
  const label = properties.name ?? properties.Name ?? properties.description;
  return typeof label === 'string' && label.trim() ? label.trim() : 'Geometría de cobertura';
}

function bindFeatureTooltip(feature: Feature, layer: Layer) {
  const content = document.createElement('span');
  content.textContent = featureLabel(feature);
  layer.bindTooltip(content, { sticky: true, direction: 'top' });
}

function numericProperty(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function featurePathOptions(feature: Feature | undefined, coverageLayer: CoverageLayer) {
  const properties = feature?.properties;
  const stroke = typeof properties?.stroke === 'string' ? properties.stroke : coverageLayer.color;
  const fill = typeof properties?.fill === 'string' ? properties.fill : coverageLayer.color;
  return {
    color: stroke,
    fillColor: fill,
    fillOpacity: numericProperty(properties?.['fill-opacity'], 0.22),
    opacity: numericProperty(properties?.['stroke-opacity'], 0.92),
    weight: numericProperty(properties?.['stroke-width'], 2.5),
  };
}

interface MapControllerProps {
  coverageBounds: L.LatLngBounds | null;
  focusLocation: MapLocation | null;
}

function MapController({ coverageBounds, focusLocation }: MapControllerProps) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);

  useEffect(() => {
    if (focusLocation) {
      map.stop();
      map.setView([focusLocation.lat, focusLocation.lng], Math.max(map.getZoom(), 14), { animate: false });
      return;
    }

    map.stop();
    if (coverageBounds?.isValid()) {
      map.fitBounds(coverageBounds, { padding: [36, 36], maxZoom: 15, animate: false });
    } else {
      map.setView(MEXICO_CENTER, 5, { animate: false });
    }
  }, [coverageBounds, focusLocation, map]);

  return null;
}

function MapClickHandler({ onLocationSelect }: Pick<LeafletMapCanvasProps, 'onLocationSelect'>) {
  useMapEvents({
    click(event) {
      onLocationSelect?.({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        label: `${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`,
      });
    },
  });
  return null;
}

export default function LeafletMapCanvas({ compact, coverageLayers, focusLocation, onLocationSelect }: LeafletMapCanvasProps) {
  const coverageBounds = useMemo(() => visibleCoverageBounds(coverageLayers), [coverageLayers]);

  return (
    <MapContainer
      center={MEXICO_CENTER}
      zoom={compact ? 5 : 6}
      minZoom={3}
      maxZoom={19}
      scrollWheelZoom
      zoomControl={!compact}
      attributionControl
      preferCanvas
      zoomAnimation={false}
      fadeAnimation={false}
      markerZoomAnimation={false}
      className="network-map__leaflet"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        updateWhenZooming={false}
        updateWhenIdle
        keepBuffer={4}
      />

      {coverageLayers.filter((layer) => layer.visible).map((coverageLayer) => (
        <GeoJSON
          key={coverageLayer.id}
          data={coverageLayer.data}
          style={(feature) => featurePathOptions(feature, coverageLayer)}
          pointToLayer={(feature, latlng) => L.circleMarker(latlng, {
            radius: 5,
            color: '#fffdf8',
            weight: 2,
            fillColor: featurePathOptions(feature, coverageLayer).fillColor,
            fillOpacity: 1,
          })}
          onEachFeature={bindFeatureTooltip}
        />
      ))}

      {focusLocation ? (
        <CircleMarker
          center={[focusLocation.lat, focusLocation.lng]}
          radius={8}
          pathOptions={{ color: '#fffdf8', weight: 3, fillColor: '#b5502f', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>{focusLocation.label}</Tooltip>
        </CircleMarker>
      ) : null}

      <MapController coverageBounds={coverageBounds} focusLocation={focusLocation} />
      <MapClickHandler onLocationSelect={onLocationSelect} />
    </MapContainer>
  );
}

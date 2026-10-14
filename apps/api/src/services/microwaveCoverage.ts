import type { CoveragePoP, CoverageTechnologyResult, SupplierCoverageRecord } from '../types.js';
import { containsPoint, geometryDistanceMeters, pointDistanceMeters, geometryLeaves, coveragePolygons, type Geometry } from './coverageGeometry.js';
import { featureTechnology } from './coverageTechnology.js';

// Display limits only: neither PoP distance nor this radius determines MW feasibility.
export const NEARBY_POP_RADIUS_METERS = 25_000;
export const MAX_NEARBY_POPS = 5;
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null;

function layerPath(value: unknown): string[] {
  if (typeof value === 'string') {
    try { return layerPath(JSON.parse(value)); } catch { return [value]; }
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function popIdentity(feature: Record<string, unknown>, microwave: boolean) {
  const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties as Record<string, unknown> : {};
  const explicitName = Object.entries(properties).find(([key]) => /^(pop[ _-]?name|nombre[ _-]?pop|nombre[ _-]?nodo|site[ _-]?name)$/i.test(key));
  const name = text(explicitName?.[1]);
  const reference = text(properties.name ?? properties.Name);
  const labels = [reference, ...layerPath(properties.__linkPartnerLayerPath), properties.type, properties.kind, properties.category, properties.tipo].filter((value): value is string => typeof value === 'string');
  const isPop = !!name || labels.some(value => /\b(pop|pops|p o p|punto de presencia)\b/.test(normalized(value)));
  // A MW point embedded with its polygons is a network reference, not an invented PoP name.
  if (!isPop && !microwave) return null;
  return { name: name || (isPop ? reference : null), reference, kind: isPop ? 'POP' as const : 'NETWORK_REFERENCE' as const };
}

export function microwaveCoverage(layers: SupplierCoverageRecord[], location: { lat: number; lng: number }, evaluated: boolean): CoverageTechnologyResult {
  const polygons: Geometry[] = [];
  const points: Omit<CoveragePoP, 'distanceMeters' | 'insideCoverage'>[] = [];
  let microwaveEvidence = false;
  for (const layer of layers) {
    for (const feature of layer.data.features) {
      const technology = featureTechnology(feature, layer.sourceFileName);
      const mw = technology === 'MW';
      microwaveEvidence ||= mw;
      const leaves = geometryLeaves(feature.geometry);
      if (mw) polygons.push(...leaves.flatMap(coveragePolygons));
      const identity = popIdentity(feature, mw);
      if (!identity) continue;
      for (const geometry of leaves) {
        const positions = geometry.type === 'Point' ? [geometry.coordinates] : geometry.type === 'MultiPoint' ? geometry.coordinates : [];
        for (const position of positions) {
          if (!Array.isArray(position) || position.length < 2) continue;
          const [longitude, latitude] = position;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
          points.push({ ...identity, supplierName: layer.supplierName, technology, latitude, longitude, sourceFileName: layer.sourceFileName });
        }
      }
    }
  }

  let distance = Infinity;
  for (const polygon of polygons) {
    try { distance = Math.min(distance, geometryDistanceMeters(polygon, location)); } catch { /* Ignore unusable geometry. */ }
  }
  const hasPolygons = Number.isFinite(distance);
  const inside = hasPolygons ? distance <= 0.000001 : null;
  const status = inside ? 'AVAILABLE' : hasPolygons || (evaluated && !microwaveEvidence) ? 'NO_COVERAGE' : 'PENDING';
  const pops = new Map<string, CoveragePoP>();
  if (microwaveEvidence) {
    for (const point of points) {
      const key = `${point.longitude}:${point.latitude}`;
      const pop: CoveragePoP = {
        ...point, distanceMeters: pointDistanceMeters(location, { lng: point.longitude, lat: point.latitude }),
        insideCoverage: polygons.some(polygon => { try { return containsPoint(polygon, point.longitude, point.latitude) || geometryDistanceMeters(polygon, { lng: point.longitude, lat: point.latitude }) <= 0.000001; } catch { return false; } }),
      };
      const previous = pops.get(key);
      if (!previous || (!previous.name && pop.name) || (previous.kind !== 'POP' && pop.kind === 'POP')) pops.set(key, pop);
    }
  }
  const ordered = [...pops.values()].sort((a, b) => a.distanceMeters - b.distanceMeters || (a.name || a.reference || '').localeCompare(b.name || b.reference || '', 'es-MX'));
  const nearestPop = ordered[0] ?? null;
  const nearbyPops = ordered.filter(pop => pop !== nearestPop && pop.insideCoverage && pop.distanceMeters <= NEARBY_POP_RADIUS_METERS).slice(0, MAX_NEARBY_POPS);
  return {
    technology: 'MW', status, classification: inside ? 'on-net' : hasPolygons ? 'off-net' : null,
    distanceMeters: hasPolygons ? distance : null, insideCoverage: inside,
    policyLevel: inside ? 'Dentro de cobertura MW' : hasPolygons ? 'Fuera de cobertura MW' : 'Cobertura MW por validar',
    reason: inside ? 'Ubicación dentro de la mancha de microonda. Prefactible, sujeta a línea de vista, capacidad y validación del sitio.' : hasPolygons ? 'Ubicación fuera de la mancha de microonda. La cercanía a un PoP no confirma cobertura.' : status === 'NO_COVERAGE' ? 'No hay cobertura de microonda identificada en los archivos evaluados.' : 'No hay polígonos MW utilizables para confirmar cobertura. Los puntos de red por sí solos no confirman factibilidad.',
    nearestPop, nearbyPops, nearbyPopRadiusMeters: NEARBY_POP_RADIUS_METERS,
  };
}

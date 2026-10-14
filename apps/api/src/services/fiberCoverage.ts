import type { CoverageTechnologyResult, SupplierCoverageRecord } from '../types.js';
import { coveragePolygons, geometryLeaves, geometryDistanceMeters } from './coverageGeometry.js';
import { featureTechnology } from './coverageTechnology.js';

function labelClassification(value: unknown): CoverageTechnologyResult['classification'] {
  if (typeof value !== 'string') return null;
  const label = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const matches = (['on-net','near-net','off-net'] as const).filter(kind => label.includes(kind.replace('-', '')));
  return matches.length === 1 ? matches[0] : null;
}
export function featureNetworkClassification(feature: Record<string, unknown>, sourceFileName: string): CoverageTechnologyResult['classification'] {
  const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties as Record<string, unknown> : {};
  const explicit = Object.entries(properties).filter(([key]) => /^(classification|clasificaci[oó]n|network_status|network_classification|nivel|nivel_estimado|policy_level|policyLevel)$/i.test(key));
  let path = properties.__linkPartnerLayerPath;
  if (typeof path === 'string') { try { path = JSON.parse(path); } catch { path = [path]; } }
  for (const label of [...explicit.map(([,value]) => value), properties.name, properties.Name, ...(Array.isArray(path) ? [...path].reverse() : []), sourceFileName]) {
    const classification = labelClassification(label);
    if (classification) return classification;
  }
  return null;
}

export function fiberCoverage(layers: SupplierCoverageRecord[], location: { lat: number; lng: number }, evaluated: boolean): CoverageTechnologyResult {
  let distance = Infinity;
  let evidence = false;
  let classification: CoverageTechnologyResult['classification'] = null;
  const priority = { 'on-net': 3, 'near-net': 2, 'off-net': 1 };
  for (const layer of layers) for (const feature of layer.data.features) {
    if ((featureTechnology(feature, layer.sourceFileName) ?? 'FO') !== 'FO') continue;
    evidence = true;
    const level = featureNetworkClassification(feature, layer.sourceFileName) ?? 'on-net';
    for (const polygon of geometryLeaves(feature.geometry).flatMap(coveragePolygons)) {
      const meters = geometryDistanceMeters(polygon, location);
      distance = Math.min(distance, meters);
      if (meters <= .000001 && priority[level] > (classification ? priority[classification] : 0)) classification = level;
    }
  }
  const hasPolygons = Number.isFinite(distance);
  classification ??= hasPolygons ? 'off-net' : null;
  const status = classification === 'on-net' ? 'AVAILABLE' : classification === 'near-net' || !hasPolygons && (evidence || !evaluated) ? 'PENDING' : 'NO_COVERAGE';
  return { technology: 'FO', status, classification, insideCoverage: hasPolygons ? distance <= .000001 : null, distanceMeters: hasPolygons ? distance : null,
    policyLevel: classification === 'on-net' ? 'OnNet según mapa' : classification === 'near-net' ? 'NearNet según mapa' : status === 'NO_COVERAGE' ? 'Fuera de cobertura FO' : 'Cobertura FO por validar',
    reason: classification === 'on-net' ? 'Ubicación dentro del área OnNet del mapa de fibra. Sujeta a validación de capacidad, ruta y permisos.' : classification === 'near-net' ? 'Ubicación dentro del área NearNet del mapa de fibra; requiere revisión técnica.' : hasPolygons ? 'El mapa no identifica cobertura FO para esta ubicación. La distancia es informativa y no determina OnNet o NearNet.' : status === 'NO_COVERAGE' ? 'No hay cobertura de fibra identificada en los archivos evaluados.' : 'No hay áreas FO utilizables para confirmar cobertura. Los trazos y puntos por sí solos requieren validación.' };
}

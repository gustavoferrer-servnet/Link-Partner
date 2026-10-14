import { coveragePolygons, geometryLeaves } from './coverageGeometry.js';
import type { SupplierCoverageRecord } from '../types.js';

export class CoverageUploadInvalid extends Error {}

// Reject malformed geometry before publication instead of letting the engine silently skip it.
function validPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}
function validGeometry(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 20) return false;
  const g = value as { type?: string; coordinates?: unknown; geometries?: unknown[] };
  const c = g.coordinates;
  const line = (v: unknown) => Array.isArray(v) && v.length >= 2 && v.every(validPosition);
  if (g.type === 'GeometryCollection') return Array.isArray(g.geometries) && g.geometries.length > 0 && g.geometries.every(item => validGeometry(item, depth + 1));
  if (g.type === 'Point') return validPosition(c);
  if (g.type === 'MultiPoint') return Array.isArray(c) && c.length > 0 && c.every(validPosition);
  if (g.type === 'LineString') return line(c);
  if (g.type === 'MultiLineString') return Array.isArray(c) && c.length > 0 && c.every(line);
  const leaves = geometryLeaves(value);
  if (g.type === 'Polygon') return coveragePolygons(leaves[0]).length === 1;
  if (g.type === 'MultiPolygon') return Array.isArray(c) && c.length > 0 && coveragePolygons(leaves[0]).length === c.length;
  return false;
}
export function validateCoverageUpload(data: SupplierCoverageRecord['data'], previous?: SupplierCoverageRecord) {
  if (!data.features.length || data.features.some(feature => !validGeometry(feature.geometry))) throw new CoverageUploadInvalid('El mapa contiene geometrías vacías o inválidas. Revisa coordenadas y cierre de polígonos; el mapa vigente se conserva.');
  const polygonCount = data.features.flatMap(feature => geometryLeaves(feature.geometry)).reduce((total, geometry) => total + coveragePolygons(geometry).length, 0);
  if (previous?.polygonCount && !polygonCount) throw new CoverageUploadInvalid('El mapa que sustituye una cobertura debe contener polígonos utilizables para FO o MW. El mapa vigente se conserva.');
  return polygonCount;
}

type Position = [number, number];
function ringContains(ring: Position[], lng: number, lat: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i]; const [px, py] = ring[j];
    if ((y > lat) !== (py > lat) && lng < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
function polygonContains(value: unknown, lng: number, lat: number): boolean {
  if (!Array.isArray(value) || !value.length) return false;
  const rings = value as Position[][];
  if (!rings.every(ring => Array.isArray(ring) && ring.length >= 4 && ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])))) return false;
  return ringContains(rings[0], lng, lat) && !rings.slice(1).some(ring => ringContains(ring, lng, lat));
}
export function containsPoint(value: unknown, lng: number, lat: number): boolean {
  if (!value || typeof value !== 'object') return false;
  const g = value as { type: string; coordinates: unknown; geometries?: unknown[] };
  if (g.type === 'Polygon') return polygonContains(g.coordinates, lng, lat);
  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) return g.coordinates.some(p => polygonContains(p, lng, lat));
  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) return g.geometries.some(p => containsPoint(p, lng, lat));
  return false;
}
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint' | 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString' | 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] }
  | { type: 'GeometryCollection'; geometries: Geometry[] };
const EARTH_RADIUS_METERS = 6_371_008.8;
function geometryContainsPoint(geometry: unknown, location: { lng: number; lat: number }) { return containsPoint(geometry, location.lng, location.lat); }
function projectedPositionDistanceMeters(position: Position, location: { lng: number; lat: number }) {
  const lng = Number(position[0]);
  const lat = Number(position[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const x = (lng - location.lng) * radians * EARTH_RADIUS_METERS * Math.cos(location.lat * radians);
  const y = (lat - location.lat) * radians * EARTH_RADIUS_METERS;
  return Math.hypot(x, y);
}

function segmentDistanceMeters(start: Position, end: Position, location: { lng: number; lat: number }) {
  const radians = Math.PI / 180;
  const metersPerDegree = radians * EARTH_RADIUS_METERS;
  const longitudeScale = metersPerDegree * Math.cos(location.lat * radians);
  const startX = (Number(start[0]) - location.lng) * longitudeScale;
  const startY = (Number(start[1]) - location.lat) * metersPerDegree;
  const endX = (Number(end[0]) - location.lng) * longitudeScale;
  const endY = (Number(end[1]) - location.lat) * metersPerDegree;
  if (![startX, startY, endX, endY].every(Number.isFinite)) return Number.POSITIVE_INFINITY;

  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  if (lengthSquared === 0) return Math.hypot(startX, startY);
  const projection = Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / lengthSquared));
  return Math.hypot(startX + projection * deltaX, startY + projection * deltaY);
}

function lineDistanceMeters(coordinates: Position[], location: { lng: number; lat: number }, closed = false) {
  if (coordinates.length === 0) return Number.POSITIVE_INFINITY;
  if (coordinates.length === 1) return projectedPositionDistanceMeters(coordinates[0], location);

  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    minimum = Math.min(minimum, segmentDistanceMeters(coordinates[index - 1], coordinates[index], location));
  }
  if (closed) minimum = Math.min(minimum, segmentDistanceMeters(coordinates.at(-1)!, coordinates[0], location));
  return minimum;
}

export function geometryDistanceMeters(geometry: Geometry | null, location: { lng: number; lat: number }): number {
  if (!geometry) return Number.POSITIVE_INFINITY;
  if (geometryContainsPoint(geometry, location)) return 0;

  if (geometry.type === 'Point') return projectedPositionDistanceMeters(geometry.coordinates, location);
  if (geometry.type === 'MultiPoint') {
    return geometry.coordinates.reduce((minimum, point) => Math.min(minimum, projectedPositionDistanceMeters(point, location)), Number.POSITIVE_INFINITY);
  }
  if (geometry.type === 'LineString') return lineDistanceMeters(geometry.coordinates, location);
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.reduce((minimum, line) => Math.min(minimum, lineDistanceMeters(line, location)), Number.POSITIVE_INFINITY);
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.reduce((minimum, ring) => Math.min(minimum, lineDistanceMeters(ring, location, true)), Number.POSITIVE_INFINITY);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((polygonMinimum, polygon) => Math.min(
      polygonMinimum,
      polygon.reduce((ringMinimum, ring) => Math.min(ringMinimum, lineDistanceMeters(ring, location, true)), Number.POSITIVE_INFINITY),
    ), Number.POSITIVE_INFINITY);
  }
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.reduce((minimum, item) => Math.min(minimum, geometryDistanceMeters(item, location)), Number.POSITIVE_INFINITY);
  }
  return Number.POSITIVE_INFINITY;
}

export function pointDistanceMeters(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const rad = Math.PI / 180;
  const sinLat = Math.sin((b.lat - a.lat) * rad / 2);
  const sinLng = Math.sin((b.lng - a.lng) * rad / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function geometryLeaves(value: unknown): Geometry[] {
  if (!value || typeof value !== 'object') return [];
  const geometry = value as Geometry;
  if (geometry.type === 'GeometryCollection') return Array.isArray(geometry.geometries) ? geometry.geometries.flatMap(geometryLeaves) : [];
  return ['Polygon', 'MultiPolygon', 'Point', 'MultiPoint', 'LineString', 'MultiLineString'].includes(geometry.type) ? [geometry] : [];
}

export function coveragePolygons(geometry: Geometry): Geometry[] {
  const candidates = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  if (!Array.isArray(candidates)) return [];
  return candidates.filter(polygon => Array.isArray(polygon) && polygon.length && polygon.every(ring => {
    if (!Array.isArray(ring) || ring.length < 4 || !ring.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return false;
    if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) return false;
    let area = 0;
    for (let index = 1; index < ring.length; index++) area += (ring[index - 1][0] - ring[0][0]) * (ring[index][1] - ring[0][1]) - (ring[index][0] - ring[0][0]) * (ring[index - 1][1] - ring[0][1]);
    return area !== 0;
  })).map(coordinates => ({ type: 'Polygon' as const, coordinates }));
}

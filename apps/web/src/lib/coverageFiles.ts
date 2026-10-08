import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

const MAX_COVERAGE_FILE_BYTES = 25 * 1024 * 1024;
const COVERAGE_COLORS = ['#157a78', '#b5502f', '#a33a3a', '#5d6fa3', '#7b6d3d', '#6b4f82'];
const LAYER_PATH_PROPERTY = '__linkPartnerLayerPath';
const FALLBACK_LAYER_NAME = 'Cobertura general';
const CATEGORY_PROPERTY_NAMES = ['layer', 'capa', 'category', 'categoria', 'group', 'grupo', 'type', 'tipo', 'network', 'red', 'technology', 'tecnologia'];

export interface CoverageLayer {
  id: string;
  name: string;
  supplierId?: string;
  supplierName?: string;
  sourceFileName?: string;
  path?: string[];
  color: string;
  data: FeatureCollection;
  featureCount: number;
  polygonCount: number;
  visible: boolean;
}

export interface CoverageSource {
  id: string;
  supplierId: string;
  supplierName: string;
  sourceFileName?: string;
  color: string;
  data: FeatureCollection;
}

export interface MapLocation {
  lat: number;
  lng: number;
  label: string;
}

export interface CoverageGeometryCounts {
  polygons: number;
  lines: number;
  points: number;
  other: number;
}

export type CoverageBusinessClassification = 'on-net' | 'near-net' | 'off-net' | 'disabled';

export interface SupplierCoverageClassification {
  supplierId: string;
  supplierName: string;
  color: string;
  classification: CoverageBusinessClassification;
  policyLevel: 'On-net' | 'Near-net' | 'Factibilidad' | 'Fuera de cobertura' | 'Sin evaluar';
  distanceMeters: number | null;
  layerName: string | null;
  sourceFileName: string | null;
  visibleLayerCount: number;
}

export const ON_NET_MAX_DISTANCE_METERS = 500;
export const NEAR_NET_MAX_DISTANCE_METERS = 1_500;
const NEAR_NET_STANDARD_MAX_DISTANCE_METERS = 1_000;
const EARTH_RADIUS_METERS = 6_371_008.8;

function addGeometryCount(counts: CoverageGeometryCounts, geometry: Geometry | null) {
  if (!geometry) return;
  if (geometry.type === 'Polygon') counts.polygons += 1;
  else if (geometry.type === 'MultiPolygon') counts.polygons += geometry.coordinates.length;
  else if (geometry.type === 'LineString') counts.lines += 1;
  else if (geometry.type === 'MultiLineString') counts.lines += geometry.coordinates.length;
  else if (geometry.type === 'Point') counts.points += 1;
  else if (geometry.type === 'MultiPoint') counts.points += geometry.coordinates.length;
  else if (geometry.type === 'GeometryCollection') geometry.geometries.forEach((item) => addGeometryCount(counts, item));
  else counts.other += 1;
}

export function coverageGeometryCounts(data: FeatureCollection) {
  const counts: CoverageGeometryCounts = { polygons: 0, lines: 0, points: 0, other: 0 };
  data.features.forEach((feature) => addGeometryCount(counts, feature.geometry));
  return counts;
}

export function formatCoverageGeometryCounts(counts: CoverageGeometryCounts) {
  const formatter = new Intl.NumberFormat('es-MX');
  const labels = [
    counts.polygons ? `${formatter.format(counts.polygons)} ${counts.polygons === 1 ? 'polígono' : 'polígonos'}` : '',
    counts.lines ? `${formatter.format(counts.lines)} ${counts.lines === 1 ? 'línea' : 'líneas'}` : '',
    counts.points ? `${formatter.format(counts.points)} ${counts.points === 1 ? 'punto' : 'puntos'}` : '',
    counts.other ? `${formatter.format(counts.other)} ${counts.other === 1 ? 'geometría' : 'geometrías'}` : '',
  ].filter(Boolean);
  return labels.join(' · ') || 'Sin geometrías';
}

export function coverageGeometrySummary(data: FeatureCollection) {
  return formatCoverageGeometryCounts(coverageGeometryCounts(data));
}

function countGeometryPolygons(geometry: Geometry | null): number {
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return 1;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.length;
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.reduce((total, item) => total + countGeometryPolygons(item), 0);
  }
  return 0;
}

function isRenderableCoverageFeature(feature: Feature) {
  if (!feature.geometry || feature.properties?.visibility === false) return false;
  const sourceType = feature.properties?.['@geometry-type'];
  return sourceType !== 'groundoverlay' && sourceType !== 'networklink';
}

async function readKml(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'kml') return file.text();
  if (extension !== 'kmz') throw new Error(`${file.name}: el formato debe ser KML o KMZ.`);

  const [{ default: JSZip }] = await Promise.all([import('jszip')]);
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const kmlEntry = Object.values(archive.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.kml'));

  if (!kmlEntry) throw new Error(`${file.name}: el KMZ no contiene un archivo KML.`);
  return kmlEntry.async('string');
}

function parseKmlXml(kmlText: string, fileName: string) {
  const parser = new DOMParser();
  let xml = parser.parseFromString(kmlText, 'text/xml');

  // Some Google Earth exports use xsi:schemaLocation without declaring xsi.
  // Browsers reject that namespace error even though Google Earth accepts it.
  if (xml.querySelector('parsererror') && /\bxsi:/.test(kmlText) && !/\bxmlns:xsi\s*=/.test(kmlText)) {
    const repairedKml = kmlText.replace(
      /<kml\b/i,
      '<kml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    );
    xml = parser.parseFromString(repairedKml, 'text/xml');
  }

  if (xml.querySelector('parsererror')) throw new Error(`${fileName}: el XML no es válido.`);
  return xml;
}

function directChildText(element: Element, localName: string) {
  const child = Array.from(element.children).find((candidate) => candidate.localName === localName);
  return child?.textContent?.trim() || '';
}

function placemarkFolderPath(placemark: Element) {
  const path: string[] = [];
  let ancestor = placemark.parentElement;

  while (ancestor) {
    if (ancestor.localName === 'Folder') {
      const name = directChildText(ancestor, 'name');
      if (name) path.unshift(name);
    }
    ancestor = ancestor.parentElement;
  }

  const directGeometryChildren = Array.from(placemark.children).filter((child) => (
    ['Point', 'LineString', 'Polygon', 'Track', 'MultiGeometry', 'MultiTrack'].includes(child.localName)
  ));
  const isGeometryCollection = directGeometryChildren.length > 1
    || directGeometryChildren.some((child) => child.localName === 'MultiGeometry' || child.localName === 'MultiTrack');
  if (isGeometryCollection) {
    const placemarkName = directChildText(placemark, 'name');
    if (placemarkName && path.at(-1) !== placemarkName) path.push(placemarkName);
  }

  return path;
}

function addLayerPathMetadata(xml: XMLDocument) {
  const namespace = xml.documentElement.namespaceURI || 'http://www.opengis.net/kml/2.2';
  const placemarks = Array.from(xml.getElementsByTagNameNS('*', 'Placemark'));

  return placemarks.map((placemark) => {
    const path = placemarkFolderPath(placemark);
    let extendedData = Array.from(placemark.children).find((child) => child.localName === 'ExtendedData');
    if (!extendedData) {
      extendedData = xml.createElementNS(namespace, 'ExtendedData');
      placemark.append(extendedData);
    }

    const data = xml.createElementNS(namespace, 'Data');
    data.setAttribute('name', LAYER_PATH_PROPERTY);
    const value = xml.createElementNS(namespace, 'value');
    value.textContent = JSON.stringify(path);
    data.append(value);
    extendedData.append(data);
    return path;
  });
}

function propertyCategory(feature: Feature) {
  const properties = feature.properties;
  if (!properties) return '';

  const property = Object.entries(properties).find(([key, value]) => (
    CATEGORY_PROPERTY_NAMES.includes(key.trim().toLocaleLowerCase('es-MX'))
    && typeof value === 'string'
    && value.trim()
  ));
  return typeof property?.[1] === 'string' ? property[1].trim() : '';
}

function geometryCategory(feature: Feature, hasMixedGeometry: boolean) {
  if (!hasMixedGeometry) return FALLBACK_LAYER_NAME;
  if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') return 'Polígonos';
  if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') return 'Líneas';
  if (feature.geometry?.type === 'Point' || feature.geometry?.type === 'MultiPoint') return 'Puntos';
  return 'Otras geometrías';
}

function featureLayerPath(feature: Feature, fallbackPath: string[] | undefined, hasMixedGeometry: boolean) {
  const storedPath = feature.properties?.[LAYER_PATH_PROPERTY];
  if (Array.isArray(storedPath)) {
    const normalized = storedPath.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
    if (normalized.length > 0) return normalized;
  }
  if (typeof storedPath === 'string') {
    try {
      const parsed = JSON.parse(storedPath) as unknown;
      if (Array.isArray(parsed)) {
        const normalized = parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim());
        if (normalized.length > 0) return normalized;
      }
    } catch {
      if (storedPath.trim()) return [storedPath.trim()];
    }
  }
  if (fallbackPath && fallbackPath.length > 0) return fallbackPath;

  if (feature.geometry?.type === 'GeometryCollection') {
    const collectionName = feature.properties?.name ?? feature.properties?.Name;
    if (typeof collectionName === 'string' && collectionName.trim()) return [collectionName.trim()];
  }

  const category = propertyCategory(feature);
  return [category || geometryCategory(feature, hasMixedGeometry)];
}

function layerPathKey(path: string[]) {
  return path.join('\u001f');
}

export async function parseCoverageFile(file: File, colorIndex: number): Promise<CoverageLayer> {
  if (file.size > MAX_COVERAGE_FILE_BYTES) {
    throw new Error(`${file.name}: supera el límite de 25 MB.`);
  }

  const kmlText = await readKml(file);
  const xml = parseKmlXml(kmlText, file.name);

  const placemarkPaths = addLayerPathMetadata(xml);

  const { kml } = await import('@tmcw/togeojson');
  const parsed = kml(xml) as FeatureCollection;
  const features = parsed.features.filter((feature): feature is Feature => isRenderableCoverageFeature(feature as Feature));

  if (features.length === 0) throw new Error(`${file.name}: no contiene geometrías de cobertura visibles.`);

  const geometryTypes = new Set(features.map((feature) => feature.geometry?.type));
  const classifiedFeatures = features.map((feature, index) => {
    const path = featureLayerPath(feature, placemarkPaths[index], geometryTypes.size > 1);
    return {
      ...feature,
      properties: {
        ...feature.properties,
        [LAYER_PATH_PROPERTY]: path,
      },
    } as Feature;
  });

  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    name: file.name,
    color: COVERAGE_COLORS[colorIndex % COVERAGE_COLORS.length],
    data: { type: 'FeatureCollection', features: classifiedFeatures },
    featureCount: classifiedFeatures.length,
    polygonCount: classifiedFeatures.reduce((total, feature) => total + countGeometryPolygons(feature.geometry), 0),
    visible: true,
  };
}

export function coverageSourceLayers(source: CoverageSource): CoverageLayer[] {
  const sourceFeatures = source.data.features.filter((feature): feature is Feature => isRenderableCoverageFeature(feature as Feature));
  const geometryTypes = new Set(sourceFeatures.map((feature) => feature.geometry?.type));
  const groups = new Map<string, { path: string[]; features: Feature[] }>();

  for (const feature of sourceFeatures) {
    const path = featureLayerPath(feature, undefined, geometryTypes.size > 1);
    const key = layerPathKey(path);
    const group = groups.get(key);
    if (group) group.features.push(feature);
    else groups.set(key, { path, features: [feature] });
  }

  return Array.from(groups.entries()).map(([key, group]) => ({
    id: `${source.id}:${key}`,
    supplierId: source.supplierId,
    supplierName: source.supplierName,
    sourceFileName: source.sourceFileName,
    name: group.path.at(-1) || FALLBACK_LAYER_NAME,
    path: group.path,
    color: source.color,
    data: { type: 'FeatureCollection', features: group.features },
    featureCount: group.features.length,
    polygonCount: group.features.reduce((total, feature) => total + countGeometryPolygons(feature.geometry), 0),
    visible: true,
  }));
}

function pointInRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLng, currentLat] = ring[index];
    const [previousLng, previousLat] = ring[previous];
    const intersects = currentLat > lat !== previousLat > lat
      && lng < ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng;
    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygonCoordinates(lng: number, lat: number, coordinates: Position[][]) {
  if (!coordinates[0] || !pointInRing(lng, lat, coordinates[0])) return false;
  return !coordinates.slice(1).some((hole) => pointInRing(lng, lat, hole));
}

function geometryContainsPoint(geometry: Geometry | null, location: MapLocation): boolean {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygonCoordinates(location.lng, location.lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(location.lng, location.lat, polygon));
  }
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.some((item) => geometryContainsPoint(item, location));
  }
  return false;
}

function projectedPositionDistanceMeters(position: Position, location: MapLocation) {
  const lng = Number(position[0]);
  const lat = Number(position[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const x = (lng - location.lng) * radians * EARTH_RADIUS_METERS * Math.cos(location.lat * radians);
  const y = (lat - location.lat) * radians * EARTH_RADIUS_METERS;
  return Math.hypot(x, y);
}

function segmentDistanceMeters(start: Position, end: Position, location: MapLocation) {
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

function lineDistanceMeters(coordinates: Position[], location: MapLocation, closed = false) {
  if (coordinates.length === 0) return Number.POSITIVE_INFINITY;
  if (coordinates.length === 1) return projectedPositionDistanceMeters(coordinates[0], location);

  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < coordinates.length; index += 1) {
    minimum = Math.min(minimum, segmentDistanceMeters(coordinates[index - 1], coordinates[index], location));
  }
  if (closed) minimum = Math.min(minimum, segmentDistanceMeters(coordinates.at(-1)!, coordinates[0], location));
  return minimum;
}

function geometryDistanceMeters(geometry: Geometry | null, location: MapLocation): number {
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

function isServnetSupplier(supplierId: string, supplierName: string) {
  const normalizedId = supplierId.trim().toLocaleLowerCase('es-MX');
  const normalizedName = supplierName.trim().toLocaleLowerCase('es-MX');
  return normalizedId === 'sup-servnet' || normalizedName === 'servnet' || normalizedName === 'red servnet';
}

export function classifyCoverageBySupplier(layers: CoverageLayer[], location: MapLocation) {
  const groups = new Map<string, CoverageLayer[]>();
  for (const layer of layers) {
    const supplierId = layer.supplierId || layer.supplierName || 'supplier';
    const group = groups.get(supplierId);
    if (group) group.push(layer);
    else groups.set(supplierId, [layer]);
  }

  return Array.from(groups.entries()).map(([supplierId, supplierLayers]): SupplierCoverageClassification => {
    const visibleLayers = supplierLayers.filter((layer) => layer.visible);
    const supplierName = supplierLayers[0]?.supplierName || 'Proveedor';
    const color = supplierLayers[0]?.color || COVERAGE_COLORS[0];
    if (visibleLayers.length === 0) {
      return {
        supplierId,
        supplierName,
        color,
        classification: 'disabled',
        policyLevel: 'Sin evaluar',
        distanceMeters: null,
        layerName: null,
        sourceFileName: null,
        visibleLayerCount: 0,
      };
    }

    let distanceMeters = Number.POSITIVE_INFINITY;
    let nearestLayer: CoverageLayer | null = null;
    for (const layer of visibleLayers) {
      for (const feature of layer.data.features) {
        const candidateDistance = geometryDistanceMeters(feature.geometry, location);
        if (candidateDistance < distanceMeters) {
          distanceMeters = candidateDistance;
          nearestLayer = layer;
        }
      }
    }

    const finiteDistance = Number.isFinite(distanceMeters) ? distanceMeters : null;
    const classification: CoverageBusinessClassification = finiteDistance !== null && finiteDistance <= ON_NET_MAX_DISTANCE_METERS
      ? 'on-net'
      : finiteDistance !== null && finiteDistance <= NEAR_NET_MAX_DISTANCE_METERS
        ? 'near-net'
        : 'off-net';
    const policyLevel = classification === 'on-net'
      ? 'On-net'
      : classification === 'near-net' && finiteDistance !== null && finiteDistance <= NEAR_NET_STANDARD_MAX_DISTANCE_METERS
        ? 'Near-net'
        : classification === 'near-net'
          ? 'Factibilidad'
          : 'Fuera de cobertura';

    return {
      supplierId,
      supplierName,
      color,
      classification,
      policyLevel,
      distanceMeters: finiteDistance,
      layerName: nearestLayer?.name ?? null,
      sourceFileName: nearestLayer?.sourceFileName ?? null,
      visibleLayerCount: visibleLayers.length,
    };
  }).sort((left, right) => {
    const leftIsServnet = isServnetSupplier(left.supplierId, left.supplierName);
    const rightIsServnet = isServnetSupplier(right.supplierId, right.supplierName);
    if (leftIsServnet !== rightIsServnet) return leftIsServnet ? -1 : 1;
    return left.supplierName.localeCompare(right.supplierName, 'es-MX');
  });
}

export function matchingCoverageLayers(layers: CoverageLayer[], location: MapLocation) {
  return layers.filter((layer) => layer.visible && layer.data.features.some((feature) => geometryContainsPoint(feature.geometry, location)));
}

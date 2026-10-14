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
    visible: !isPoPLayer({ name: group.path.at(-1) || FALLBACK_LAYER_NAME, path: group.path, sourceFileName: source.sourceFileName, data: { type: 'FeatureCollection', features: group.features } }),
  }));
}

export function isPoPLayer(layer: Pick<CoverageLayer, 'name' | 'path' | 'sourceFileName' | 'data'>) {
  const labels = [layer.name, ...(layer.path ?? []), layer.sourceFileName ?? ''].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return /\b(pops?|puntos? de presencia|points? of presence)\b/.test(labels)
    || layer.data.features.some(feature => Object.keys(feature.properties ?? {}).some(key => /^(pop[ _-]?name|nombre[ _-]?pop|nombre[ _-]?nodo|site[ _-]?name)$/i.test(key)));
}

// KML can embed an invisible label point beside coverage polygons in a
// GeometryCollection. Google Data ignores KML icon-opacity, so omit those
// points from the display only; keep the original geometry for calculations.
export function coverageDisplayData(data: FeatureCollection): FeatureCollection {
  function withoutPoints(geometry: Geometry | null): Geometry | null {
    if (!geometry || geometry.type === 'Point' || geometry.type === 'MultiPoint') return null;
    if (geometry.type !== 'GeometryCollection') return geometry;
    const geometries = geometry.geometries.flatMap(item => {
      const visible = withoutPoints(item);
      return visible ? [visible] : [];
    });
    if (geometries.length === 0) return null;
    return geometries.every((item, index) => item === geometry.geometries[index]) && geometries.length === geometry.geometries.length
      ? geometry : { ...geometry, geometries };
  }

  const features = data.features.flatMap(feature => {
    const opacity = feature.properties?.['icon-opacity'];
    const scale = feature.properties?.['icon-scale'];
    if (!((opacity != null && Number(opacity) === 0) || (scale != null && Number(scale) === 0))) return [feature];
    const geometry = withoutPoints(feature.geometry);
    return geometry ? [geometry === feature.geometry ? feature : { ...feature, geometry }] : [];
  });
  return features.length === data.features.length && features.every((feature, index) => feature === data.features[index])
    ? data : { ...data, features };
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

export function matchingCoverageLayers(layers: CoverageLayer[], location: MapLocation) {
  return layers.filter((layer) => layer.visible && layer.data.features.some((feature) => geometryContainsPoint(feature.geometry, location)));
}

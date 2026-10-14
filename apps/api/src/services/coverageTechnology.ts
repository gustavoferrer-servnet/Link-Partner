import type { CoverageTechnology, CoverageTechnologyResult } from '../types.js';

function labelTechnology(value: unknown): CoverageTechnology | null {
  if (typeof value !== 'string') return null;
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const mw = /\b(mw|microondas?|microwaves?)\b/.test(text);
  const fo = /\b(fo|fibra|fiber|fibre)\b/.test(text) || /\bf o\b/.test(text);
  return mw === fo ? null : mw ? 'MW' : 'FO';
}
// Technology comes from explicit metadata, the most specific KML layer/name, then the file.
// Unlabelled features are assigned FO by the coverage engine under the business rule.
export function featureTechnology(feature: Record<string, unknown>, sourceFileName: string): CoverageTechnology | null {
  const properties = feature.properties && typeof feature.properties === 'object' ? feature.properties as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(properties)) {
    if (/^(technology|tecnolog[ií]a|tecnologia_acceso|access_technology)$/i.test(key)) {
      const technology = labelTechnology(value);
      if (technology) return technology;
      if (typeof value === 'string' && value.trim()) return null;
    }
  }
  let path = properties.__linkPartnerLayerPath;
  if (typeof path === 'string') { try { path = JSON.parse(path); } catch { path = [path]; } }
  for (const label of [properties.name, properties.Name, ...(Array.isArray(path) ? [...path].reverse() : []), sourceFileName]) {
    const technology = labelTechnology(label);
    if (technology) return technology;
  }
  return null;
}
export function technologySummary(suppliers: { supplierName: string; technologies?: CoverageTechnologyResult[] }[]): CoverageTechnologyResult[] {
  return (['MW', 'FO'] as const).map(technology => {
    const results = suppliers.flatMap(supplier => (supplier.technologies ?? []).filter(result => result.technology === technology).map(result => ({ ...result, supplierName: supplier.supplierName })));
    const available = results.filter(result => result.status === 'AVAILABLE');
    if (technology === 'MW' && results.length) {
      const pending = results.filter(result => result.status === 'PENDING');
      const eligible = available.length ? available : pending.length ? pending : results;
      const best = [...eligible].sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0];
      const pops = eligible.flatMap(result => [result.nearestPop, ...(result.nearbyPops ?? [])].filter((pop): pop is NonNullable<typeof pop> => !!pop));
      const unique = [...new Map(pops.map(pop => [`${pop.supplierName}:${pop.longitude}:${pop.latitude}`, pop])).values()].sort((a,b) => a.distanceMeters - b.distanceMeters);
      const nearestPop = unique[0] ?? null;
      return { ...best, supplierNames: available.map(result => result.supplierName), nearestPop, nearbyPops: unique.filter(pop => pop !== nearestPop && pop.insideCoverage && pop.distanceMeters <= (best.nearbyPopRadiusMeters ?? 25_000)).slice(0,5) };
    }
    const nearby = results.filter(result => result.classification === 'near-net');
    const pending = results.filter(result => result.status === 'PENDING');
    const eligible = available.length ? available : nearby.length ? nearby : pending.length ? pending : results;
    const best = [...eligible].sort((a,b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0];
    return best ? { ...best, supplierNames: (available.length ? available : nearby).map(result => result.supplierName) } : {
      technology, status: 'PENDING', classification: null, distanceMeters: null, insideCoverage: null,
      policyLevel: 'Cobertura por validar', reason: 'No hay mapas evaluados para confirmar esta tecnología.', supplierNames: [],
    };
  });
}

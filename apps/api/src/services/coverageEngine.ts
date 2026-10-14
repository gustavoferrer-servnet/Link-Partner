import { CoverageConflict, coverageMapVersion } from './coverageVersions.js';
import { repository } from '../repositories/index.js';
import { checkCoverage, publicConsultation, COVERAGE_POLICY_VERSION } from './prefeasibility.js';
import type { AppUser, ConsultationRecord } from '../types.js';

export const digitalCoverageIdentity: AppUser = { authUid: 'coverage-engine', email: '', displayName: 'Coverage Engine', participantId: null, organization: 'Link Partner', roles: ['pre_sales'], enabled: true };
// All locations in one consultation use the same immutable snapshot of the active maps.
export async function evaluateConsultationLocations(inputs: ConsultationRecord['input'][]) {
  const layers = await repository.listSupplierCoverages(digitalCoverageIdentity);
  return inputs.map(input => checkCoverage(input, layers));
}
// Both the public CX orchestration and authenticated API use the same data source and engine.
export async function evaluateSupplierCoverage(input: ConsultationRecord['input'], identity: AppUser, selection?: { id: string; revisionId: string; featureIndexes: number[] }[]) {
  const layers = await repository.listSupplierCoverages(identity);
  const selected = selection ? selection.flatMap(item => {
    const layer = layers.find(layer => layer.id === item.id);
    if (!layer || coverageMapVersion(layer).revisionId !== item.revisionId) throw new CoverageConflict('La selección corresponde a un mapa anterior. Actualiza las coberturas y vuelve a consultar.');
    if (item.featureIndexes.some(index => index >= layer.data.features.length)) throw new CoverageConflict('Las capas seleccionadas no corresponden al mapa vigente.');
    const indexes = new Set(item.featureIndexes);
    return [{ ...layer, data: { ...layer.data, features: layer.data.features.filter((_, index) => indexes.has(index)) } }];
  }) : layers;
  return checkCoverage(input, selected);
}
export function coverageResponse(coverage: ConsultationRecord['coverage']) {
  return {
    engine: 'link-partner-supplier-coverage', policyVersion: coverage.policyVersion ?? COVERAGE_POLICY_VERSION,
    technologies: coverage.technologies, status: coverage.status, checkedAt: coverage.checkedAt, reason: coverage.reason,
    versions: coverage.versions,
    fiberPolicy: { feasibility: 'inside-polygon', classification: 'map-label', distance: 'informational-only' },
    microwavePolicy: { feasibility: 'inside-polygon', popDistance: 'straight-line', nearbyPopRadiusMeters: 25000, maxNearbyPops: 5 },
    suppliers: (coverage.suppliers ?? []).map(({ supplierId, supplierName, classification, policyLevel, distanceMeters, technologies }) => ({ supplierId, supplierName, classification, policyLevel, technologies, distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters) })),
  };
}

// Historical results and map versions are immutable. Never re-evaluate under today's policy.
export async function presentConsultation(record: ConsultationRecord) {
  return publicConsultation(record);
}

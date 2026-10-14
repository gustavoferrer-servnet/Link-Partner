import type { ConsultationRecord, ConsultationServiceResult } from '../types.js';

export function feasibleCarriers(coverage: ConsultationRecord['coverage']) {
  if (coverage.status === 'ERROR' || coverage.status === 'NO_COVERAGE') return [];
  const suppliers = (coverage.suppliers ?? []).filter(supplier => supplier.technologies?.length
    ? supplier.technologies.some(technology => technology.insideCoverage === true && (
      technology.status === 'AVAILABLE' && technology.classification === 'on-net'
      || technology.status === 'PENDING' && technology.classification === 'near-net'
    ))
    : supplier.classification === 'on-net' || supplier.classification === 'near-net');
  return [...new Map(suppliers.map(supplier => [supplier.supplierId, { id: supplier.supplierId, name: supplier.supplierName }])).values()];
}
// L2L requires the same carriers at both ends; different carriers at A and B cannot establish redundancy.
export function serviceCarriers(service: Pick<ConsultationServiceResult, 'locationIndexes'>, locations: { coverage: ConsultationRecord['coverage'] }[]) {
  const groups = service.locationIndexes.map(index => feasibleCarriers(locations[index].coverage));
  return groups[0].filter(supplier => groups.every(group => group.some(candidate => candidate.id === supplier.id)));
}

export function proposalOptions(record: ConsultationRecord) {
  // Carriers feasible at different addresses do not establish redundancy at either address.
  const locations = record.locations ?? [{ coverage: record.coverage }];
  const groups = record.services ? record.services.map(service => serviceCarriers(service, locations)) : locations.map(location => feasibleCarriers(location.coverage));
  const suppliers = groups.reduce((best, group) => group.length > best.length ? group : best, [] as ReturnType<typeof feasibleCarriers>);
  const available = suppliers.length >= 2;
  return { carrierRedundancyAvailable: available, carrierRedundancyRequested: available && record.proposalPreferences?.carrierRedundancy === true,
    feasibleSupplierCount: suppliers.length, supplierNames: suppliers.map(supplier => supplier.name), updatedAt: record.proposalPreferences?.updatedAt ?? null,
    ...(record.services ? { redundancyLocations: record.services.filter((_, index) => groups[index].length >= 2).map(service => service.locationIndexes.map(index => (record.locations?.[index].input ?? record.input).address).join(' ↔ ')) } : record.locations ? { redundancyLocations: record.locations.filter(location => feasibleCarriers(location.coverage).length >= 2).map(location => location.input.address) } : {}) };
}
export class CarrierRedundancyUnavailable extends Error {
  constructor() { super('La redundancia requiere al menos dos rutas prefactibles en esta consulta.'); }
}
// Use the saved feasibility evidence, including its map revisions; never re-evaluate it here.
export function changeProposalPreference(record: ConsultationRecord, requested: boolean) {
  if (requested && !proposalOptions(record).carrierRedundancyAvailable) throw new CarrierRedundancyUnavailable();
  return { ...record, proposalPreferences: { carrierRedundancy: requested, updatedAt: new Date().toISOString(), source: 'CUSTOMER' as const },
    opportunity: { ...record.opportunity, carrierRedundancyRequested: requested } };
}

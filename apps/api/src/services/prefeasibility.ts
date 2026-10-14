import { feasibleCarriers, serviceCarriers, proposalOptions } from './carrierRedundancy.js';
import type { ConsultationRecord, SupplierCoverageRecord } from '../types.js';
import { technologySummary } from './coverageTechnology.js';
import { geometryDistanceMeters, type Geometry } from './coverageGeometry.js';
import { microwaveCoverage } from './microwaveCoverage.js';
import { fiberCoverage } from './fiberCoverage.js';
import { coverageMapVersion } from './coverageVersions.js';
export const COVERAGE_POLICY_VERSION = 'lp-map-v3';
export { containsPoint } from './coverageGeometry.js';
export function checkCoverage(input: ConsultationRecord['input'], layers: SupplierCoverageRecord[]): ConsultationRecord['coverage'] {
  const base = { policyVersion: COVERAGE_POLICY_VERSION, technologies: technologySummary([]), checkedAt: new Date().toISOString(), providerIds: [] as string[], suppliers: [] as NonNullable<ConsultationRecord['coverage']['suppliers']>, versions: layers.map(coverageMapVersion) };
  if (input.longitude === undefined || input.latitude === undefined) return { ...base, status: 'PENDING', reason: 'Confirma la dirección de instalación para evaluar cobertura.' };
  if (!layers.length) return { ...base, status: 'PENDING', reason: 'No hay coberturas cargadas en este entorno de Link Partner para evaluar la ubicación.' };
  const groups = new Map<string, { supplierName: string; distance: number; layers: SupplierCoverageRecord[] }>();
  const location = { lng: input.longitude, lat: input.latitude };
  for (const layer of layers) {
    const group = groups.get(layer.supplierId) ?? { supplierName: layer.supplierName, distance: Infinity, layers: [] };
    group.layers.push(layer);
    for (const feature of layer.data.features) {
      try {
        const distance = geometryDistanceMeters(feature.geometry as Geometry | null, location);
        group.distance = Math.min(group.distance, distance);
      }
      catch { /* An unsupported or malformed feature cannot provide coverage evidence. */ }
    }
    groups.set(layer.supplierId, group);
  }
  const suppliers = Array.from(groups, ([supplierId, group]) => {
    const technologies = [microwaveCoverage(group.layers, location, Number.isFinite(group.distance)), fiberCoverage(group.layers, location, Number.isFinite(group.distance))];
    const best = technologies.find(result => result.status === 'AVAILABLE') || technologies.find(result => result.status === 'PENDING' && result.classification === 'near-net');
    const known = technologies.map(result => result.distanceMeters).filter((value): value is number => value !== null);
    const distance = known.length ? Math.min(...known) : null;
    return { technologies, supplierId, supplierName: group.supplierName, classification: best?.classification || 'off-net' as const, distanceMeters: distance, policyLevel: best?.policyLevel || (distance === null ? 'Sin cobertura evaluable' : 'Fuera de cobertura') };
  }).sort((a,b) => a.supplierId === 'SUP-SERVNET' ? -1 : b.supplierId === 'SUP-SERVNET' ? 1 : a.supplierName.localeCompare(b.supplierName, 'es-MX'));
  const providerIds = suppliers.filter(s => s.classification !== 'off-net').map(s => s.supplierId);
  const hasOnNet = suppliers.some(s => s.classification === 'on-net');
  const summary = technologySummary(suppliers);
  const status = hasOnNet ? 'AVAILABLE' : providerIds.length || summary.some(result => result.status === 'PENDING') ? 'PENDING' : 'NO_COVERAGE';
  return { ...base, suppliers, technologies: summary, providerIds, status, reason: hasOnNet ? 'Cobertura On Net preliminar en las redes registradas. Sujeta a validación de capacidad, ruta, permisos y obra civil.' : providerIds.length ? 'Encontramos redes Near Net. La conexión requiere revisión de factibilidad y posibles trabajos adicionales.' : status === 'NO_COVERAGE' ? 'Ubicación fuera del alcance de las redes registradas. Un asesor puede revisar alternativas.' : 'Los archivos cargados no contienen geometrías utilizables para evaluar esta ubicación.' };
}
// Positive allowlists protect old saved results as well as newly evaluated consultations.
const publicReasons = {
  AVAILABLE: 'Cobertura preliminar disponible. Sujeta a validación técnica final.',
  PENDING: 'Prefactibilidad por validar. Un asesor revisará las alternativas.',
  NO_COVERAGE: 'Sin rutas prefactibles identificadas. Un asesor puede revisar alternativas.',
  ERROR: 'No fue posible confirmar la prefactibilidad. Requiere revisión.',
};
export function publicCoverage(coverage: ConsultationRecord['coverage'], routeCount = feasibleCarriers(coverage).length) {
  const status = Object.hasOwn(publicReasons, coverage.status) ? coverage.status : 'PENDING';
  return { status, routeCount, reason: publicReasons[status], checkedAt: coverage.checkedAt,
    technologies: (coverage.technologies ?? technologySummary(coverage.suppliers ?? []))
      .filter(value => value.technology === 'MW' || value.technology === 'FO').map(value => {
        const distance = value.nearestPop?.kind === 'POP' ? value.nearestPop.distanceMeters : null;
        return { technology: value.technology,
          status: value.status === 'AVAILABLE' || value.status === 'NO_COVERAGE' ? value.status : 'PENDING',
          nearestPopDistanceMeters: typeof distance === 'number' && Number.isFinite(distance) && distance >= 0 ? Math.round(distance) : null };
      }) };
}
function publicInput(input: ConsultationRecord['input']) {
  const { channel, address, city, product, capacityMbps, latitude, longitude, customerReference, fullName, email, company, firstName, lastName } = input;
  return { channel, address, city, product, capacityMbps, latitude, longitude, customerReference, fullName, email, company, firstName, lastName };
}
export function publicConsultation(record: ConsultationRecord) {
  const options = proposalOptions(record);
  const locations = record.locations ?? [{ input: record.input, coverage: record.coverage }];
  return { proposalOptions: {
      carrierRedundancyAvailable: options.carrierRedundancyAvailable, carrierRedundancyRequested: options.carrierRedundancyRequested,
      routeCount: options.feasibleSupplierCount, updatedAt: options.updatedAt,
      ...(options.redundancyLocations ? { redundancyLocations: options.redundancyLocations } : {}),
    }, code: record.code, opportunityId: record.opportunity.id, source: 'DIGITAL', channel: record.input.channel,
    ...(record.services ? { services: record.services.map(service => ({ product: service.product, capacityMbps: service.capacityMbps,
      locationIndexes: service.locationIndexes, coverage: {
        ...publicCoverage(service.coverage, serviceCarriers(service, locations).length),
        ...(service.product === 'L2L' ? { reason: 'El enlace requiere validar transporte entre A y B, capacidad y compatibilidad técnica.' } : {}),
      } })) } : {}),
    input: publicInput(record.input), qualificationStatus: record.qualificationStatus, coverage: publicCoverage(record.coverage),
    ...(record.locations ? { locations: record.locations.map(location => ({ input: publicInput(location.input), coverage: publicCoverage(location.coverage) })) } : {}),
    pricing: { status: 'PENDING', amount: null, currency: 'MXN', reason: 'Precio sujeto a propuesta comercial y validación técnica final.' },
    createdAt: record.createdAt, tracking: { stage: 'Solicitud recibida', state: 'En validación', commitmentDate: null as string | null, nextAction: 'Validar factibilidad y preparar propuesta comercial.' } };
}
// Internal Link Partner keeps the complete immutable evidence, including network identities and maps.
export function internalConsultation(record: ConsultationRecord) {
  return { ...publicConsultation(record), proposalOptions: proposalOptions(record), input: record.input,
    coverage: record.coverage, services: record.services, locations: record.locations, pricing: record.pricing };
}
export function consultationSummary(record: ConsultationRecord) {
  return {
    code: record.code, opportunityId: record.opportunity.id, createdAt: record.createdAt, ...(record.services ? { serviceCount: record.services.length, capacitiesMbps: record.services.map(service => service.capacityMbps) } : {}), locationCount: record.locations?.length ?? 1, addresses: record.locations?.map(location => location.input.address) ?? [record.input.address],
    channel: record.input.channel, qualificationStatus: record.qualificationStatus,
    fullName: record.input.fullName || [record.input.firstName, record.input.lastName].filter(Boolean).join(' ') || null,
    email: record.input.email || null, company: record.input.company || null,
    customerReference: record.input.customerReference || null,
    address: record.input.address, city: record.input.city, product: record.input.product,
    carrierRedundancyRequested: proposalOptions(record).carrierRedundancyRequested,
    capacityMbps: record.input.capacityMbps, coverageStatus: record.coverage.status,
  };
}

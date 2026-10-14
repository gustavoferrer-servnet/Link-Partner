import type { DeliveryProjectRecord, SupplierEvaluation, SupplierManagement, SupplierRecord } from '../types.js';

export class SupplierManagementConflict extends Error {}
export const supplierMetrics = [
  { id: 'availability', label: 'Enlaces-mes que cumplen disponibilidad', weight: 25 },
  { id: 'resolution', label: 'Incidentes resueltos dentro del SLA', weight: 25 },
  { id: 'delivery', label: 'Entregas dentro del compromiso original', weight: 15 },
  { id: 'quality', label: 'Aceptación a la primera sin retrabajo', weight: 15 },
  { id: 'response', label: 'Respuestas dentro del tiempo acordado', weight: 10 },
  { id: 'commitment', label: 'Compromisos cumplidos al vencimiento', weight: 10 },
] as const;

export function initialSupplierManagement(now = new Date()): SupplierManagement {
  const date = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const validation = new Date(now);
  let businessDays = 0;
  while (businessDays < 10) { validation.setUTCDate(validation.getUTCDate() + 1); if (![0, 6].includes(validation.getUTCDay())) businessDays++; }
  return { version: 0, startedAt: now.toISOString(), owner: '', validationDue: validation.toISOString().slice(0, 10), nextReview: date(30), nextCapacityReview: date(90), contract: { sla: null, contractEnd: null },
    requirements: [
      { id: 'contact', label: 'Contacto operativo y ruta de escalamiento' },
      { id: 'services', label: 'Servicios, cobertura y capacidad confirmados' },
      { id: 'sla', label: 'SLA y condiciones operativas acordados' },
      { id: 'documents', label: 'Documentación indispensable según el servicio' },
    ].map(item => ({ ...item, fulfilled: false, evidence: '', validUntil: null })),
    observations: [], actions: [], authorization: null, history: [],
  };
}

export function evaluateSupplier(supplier: SupplierRecord, projects: DeliveryProjectRecord[], now = new Date()): SupplierEvaluation {
  const end = now.getTime();
  const start = end - 90 * 86400000;
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const management = supplierManagementOf(supplier);
  const dateEnd = (value: string) => Date.parse(value.length === 10 ? `${value}T23:59:59.999-06:00` : value);
  const dateStart = (value: string) => Date.parse(value.length === 10 ? `${value}T00:00:00-06:00` : value);
  const inPeriod = (value: string) => dateEnd(value) >= start && dateStart(value) <= end;
  // Existing delivery projects identify their provider by name. Require an exact normalized match.
  const matching = projects.filter(p => p.syncStatus !== 'Simulado' && p.provider?.trim().toLocaleLowerCase('es-MX') === supplier.name.trim().toLocaleLowerCase('es-MX'));
  const deliveryEvidence = matching.flatMap(p => {
    if (p.operationalStatus === 'Cancelado' || !p.originalCommitment) return [];
    const eventDate = p.actualDeliveryDate ?? p.originalCommitment;
    if (!inPeriod(eventDate) || (!p.actualDeliveryDate && dateEnd(p.originalCommitment) >= end)) return [];
    return [{ id: p.id, reference: p.site, dueAt: p.originalCommitment, completedAt: p.actualDeliveryDate,
      complies: !!p.actualDeliveryDate && dateStart(p.actualDeliveryDate) <= dateEnd(p.originalCommitment) }];
  });
  const metrics = supplierMetrics.map(metric => {
    const manual = (management?.observations ?? []).filter(o => o.metric === metric.id && (o.outcome === 'pending' ? dateEnd(o.dueAt) >= start : inPeriod(o.completedAt ?? o.dueAt))
      && !(metric.id === 'delivery' && matching.some(p => p.id === o.reference)));
    const evaluated = manual.filter(o => o.outcome !== 'pending' || dateEnd(o.dueAt) < end);
    let count = evaluated.length;
    let complies = evaluated.filter(o => o.outcome === 'complies').length;
    if (metric.id === 'delivery') { count += deliveryEvidence.length; complies += deliveryEvidence.filter(o => o.complies).length; }
    return { ...metric, evaluated: count, complies, pending: manual.length - evaluated.length, score: count ? Math.round(complies / count * 100) : null };
  });
  const coverage = metrics.reduce((sum, m) => sum + (m.evaluated ? m.weight : 0), 0);
  const score = coverage ? Math.round(metrics.reduce((sum, m) => sum + (m.evaluated ? m.complies / m.evaluated * 100 * m.weight : 0), 0) / coverage) : null;
  // Explicit, provisional evidence rule. A sparse high score never grants full habilitation.
  const confidence = !coverage ? 'Sin historial' : coverage >= 70 && metrics.filter(m => m.evaluated > 0).every(m => m.evaluated >= 5) ? 'Suficiente' : 'Limitada';
  const critical = (management?.observations ?? []).some(o => o.critical && !management?.actions.some(a => a.id === o.id && a.status === 'Cerrada'));
  const fulfilled = !!management && management.requirements.length === 4 && management.requirements.every(r => r.fulfilled && r.evidence.trim() && (!r.validUntil || r.validUntil >= today));
  const recommendation = critical ? 'Restringido para nuevas contrataciones' : !fulfilled ? 'En validación inicial' : score !== null && score < 70 ? 'Restringido para nuevas contrataciones' : score !== null && score < 85 ? 'Condicionado' : confidence !== 'Suficiente' ? 'Habilitado provisional' : 'Habilitado';
  return { score, coverage, confidence, recommendation, critical, periodStart: new Date(start).toISOString(), periodEnd: now.toISOString(), metrics, deliveryEvidence };
}

export function supplierManagementOf(supplier: SupplierRecord) {
  return supplier.management ?? { ...initialSupplierManagement(new Date('2026-10-13T12:00:00Z')), contract: { sla: supplier.sla, contractEnd: supplier.contractEnd } };
}

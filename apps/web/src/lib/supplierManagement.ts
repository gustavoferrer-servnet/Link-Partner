import type { Supplier } from '../types';
export function supplierState(supplier: Supplier) { return supplier.management?.authorization?.state ?? 'En validación inicial'; }
export function supplierAlerts(supplier: Supplier, today: string) {
  const m = supplier.management;
  if (!m) return ['Validación inicial por asignar'];
  const alerts: string[] = [];
  if (!m.ownerUser) alerts.push('Asignar usuario de Application Hub');
  if (m.validationDue < today && supplierState(supplier) === 'En validación inicial') alerts.push('Validación vencida');
  if (m.nextReview <= today) alerts.push('Revisión mensual');
  if (m.nextCapacityReview <= today) alerts.push('Revisión trimestral de capacidad');
  if (m.requirements.some(r => r.validUntil && r.validUntil < today)) alerts.push('Requisito vencido');
  if (m.actions.some(a => a.status === 'Abierta' && a.dueAt < today)) alerts.push('Acción correctiva vencida');
  if (supplier.evaluation?.critical) alerts.push('Hallazgo crítico');
  if (m.authorization && supplier.evaluation?.recommendation !== m.authorization.state) alerts.push('Revisar estado autorizado');
  if (supplier.contractEnd) {
    const days = Math.ceil((Date.parse(supplier.contractEnd) - Date.parse(today)) / 86400000);
    if (days <= 60) alerts.push(days < 0 ? 'Contrato vencido' : `Contrato vence en ${days} días`);
  }
  return alerts;
}

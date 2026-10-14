export const consultationStatuses: Record<string, string> = {
  PRICING_PENDING: 'Propuesta pendiente',
  FEASIBILITY_PENDING: 'Revisión técnica',
  NO_COVERAGE: 'Sin cobertura',
  VALIDATION_PENDING: 'Validación pendiente',
};
export const coverageStatuses: Record<string, string> = { AVAILABLE: 'Prefactible', PENDING: 'Por validar', NO_COVERAGE: 'Sin cobertura', ERROR: 'Validación pendiente' };
export const consultationDate = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

import type { ConsultationRecord } from '../types.js';

export function combinedCoverage(results: ConsultationRecord['coverage'][]): ConsultationRecord['coverage'] {
  if (results.length === 1) return results[0];
  const available = results.filter(result => result.status === 'AVAILABLE').length;
  const missing = results.filter(result => result.status === 'NO_COVERAGE').length;
  const errors = results.filter(result => result.status === 'ERROR').length;
  const status = available === results.length ? 'AVAILABLE' : missing === results.length ? 'NO_COVERAGE' : errors === results.length ? 'ERROR' : 'PENDING';
  return { status, checkedAt: results[0].checkedAt, policyVersion: results[0].policyVersion, versions: results[0].versions,
    providerIds: [...new Set(results.flatMap(result => result.providerIds))], technologies: [], suppliers: [],
    reason: `${available} de ${results.length} localidades prefactibles; ${missing} sin cobertura identificada y ${results.length - available - missing} por validar. Revisa el resultado de cada dirección.` };
}

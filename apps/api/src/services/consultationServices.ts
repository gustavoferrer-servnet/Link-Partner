import type { ConsultationRecord, ConsultationServiceResult } from '../types.js';
import { combinedCoverage } from './multiLocation.js';

export function serviceCoverage(product: ConsultationServiceResult['product'], results: ConsultationRecord['coverage'][]): ConsultationRecord['coverage'] {
  const coverage = combinedCoverage(results);
  if (product !== 'L2L') return coverage;
  return { ...coverage, status: coverage.status === 'AVAILABLE' ? 'PENDING' : coverage.status,
    reason: `${results.filter(result => result.status === 'AVAILABLE').length} de 2 puntas con cobertura preliminar. El enlace L2L requiere validar transporte entre A y B, capacidad y compatibilidad técnica; la cobertura de las puntas no confirma el enlace.` };
}

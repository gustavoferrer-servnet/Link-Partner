import { randomBytes } from 'node:crypto';
import type { ConsultationRecord } from '../types.js';
import type { Repository } from '../repositories/Repository.js';

export const CONSULTATION_CODE_LENGTH = 6;
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// Six-character codes are issued now; existing short and legacy codes remain valid.
export function isShortConsultationCode(code: string) {
  return /^(?:[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{8})$/.test(code);
}
export function isConsultationCode(code: string) {
  return isShortConsultationCode(code) || /^LP-[A-F0-9]{20}$/.test(code);
}
export class ConsultationCodeCollision extends Error {
  constructor() { super('El código de consulta ya fue reservado.'); }
}
export function generateConsultationCode() {
  return Array.from(randomBytes(CONSULTATION_CODE_LENGTH), byte => alphabet[byte & 31]).join('');
}
// Uniqueness comes from the repository's atomic reservation, never from chance alone.
export async function reserveConsultation(repository: Repository, record: Omit<ConsultationRecord, 'code'>, generate = generateConsultationCode) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generate();
    try { return await repository.createConsultation({ ...record, code, opportunity: { ...record.opportunity, id: `OPP-${record.opportunity.source === 'COVERAGE' ? 'COVERAGE' : 'DIGITAL'}-${code}`, siteId: code, consultationCode: code } }); }
    catch (error) { if (!(error instanceof ConsultationCodeCollision)) throw error; }
  }
  throw new Error('No fue posible reservar un código único. Reintenta la consulta.');
}

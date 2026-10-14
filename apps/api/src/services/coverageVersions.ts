import { createHash, randomUUID } from 'node:crypto';
import type { AppUser, CoverageActivity, CoverageMapVersion, SupplierCoverageRecord, RetiredSupplierCoverage } from '../types.js';

export class CoverageConflict extends Error {
  constructor(message = 'El mapa cambió. Actualiza las coberturas antes de continuar.') { super(message); }
}

// Existing maps get a reproducible baseline; this does not fabricate past upload events.
export function coverageMapVersion(record: SupplierCoverageRecord): CoverageMapVersion {
  if (record.mapVersion) return structuredClone(record.mapVersion);
  const sha256 = createHash('sha256').update(JSON.stringify(record.data)).digest('hex');
  return { id: record.id, supplierId: record.supplierId, supplierName: record.supplierName, sourceFileName: record.sourceFileName, version: 1,
    revisionId: `baseline-${createHash('sha256').update(`${record.id}:${record.updatedAt}:${sha256}`).digest('hex')}`, sha256, updatedAt: record.updatedAt };
}

// Call inside the repository's atomic mutation, using the last committed revision.
export function coverageUpdate(record: SupplierCoverageRecord, previous: SupplierCoverageRecord | undefined, user: AppUser, expectedRevisionId?: string | null) {
  const previousMap = previous ? coverageMapVersion(previous) : null;
  // undefined is reserved for trusted repository callers; API writes always supply a precondition.
  if (expectedRevisionId !== undefined && expectedRevisionId !== (previousMap?.revisionId ?? null)) throw new CoverageConflict();
  if (previous && previous.supplierId !== record.supplierId) throw new CoverageConflict('El mapa pertenece a otro proveedor.');
  const updatedAt = new Date().toISOString();
  const map: CoverageMapVersion = { id: record.id, supplierId: record.supplierId, supplierName: record.supplierName, sourceFileName: record.sourceFileName,
    version: (previousMap?.version ?? 0) + 1, revisionId: randomUUID(), sha256: createHash('sha256').update(JSON.stringify(record.data)).digest('hex'), updatedAt };
  const saved = { ...record, updatedAt, updatedBy: user.email, mapVersion: map };
  const activity: CoverageActivity = { id: randomUUID(), action: previous ? 'UPDATED' : 'CREATED', occurredAt: updatedAt,
    actor: { authUid: user.authUid, email: user.email, displayName: user.displayName }, map, previousMap, featureCount: saved.featureCount, polygonCount: saved.polygonCount };
  return { saved, activity };
}

export function coverageRetirement(record: SupplierCoverageRecord, user: AppUser, expectedRevisionId: string) {
  const map = coverageMapVersion(record);
  if (map.revisionId !== expectedRevisionId) throw new CoverageConflict('El archivo cambió. Revisa su versión antes de eliminarlo.');
  const activity: CoverageActivity = { id: randomUUID(), action: 'DELETED', occurredAt: new Date().toISOString(), actor: { authUid: user.authUid, email: user.email, displayName: user.displayName }, map, previousMap: map, featureCount: record.featureCount, polygonCount: record.polygonCount };
  const retired: RetiredSupplierCoverage = { record: structuredClone({ ...record, mapVersion: map }), activityId: activity.id, retiredAt: activity.occurredAt };
  return { retired, activity };
}

export function coverageRestoration(retired: RetiredSupplierCoverage, user: AppUser, activityId: string) {
  if (retired.activityId !== activityId) throw new CoverageConflict('Este retiro ya cambió. Actualiza el listado antes de restaurar.');
  const result = coverageUpdate(retired.record, retired.record, user, coverageMapVersion(retired.record).revisionId);
  result.activity.action = 'RESTORED';
  return result;
}

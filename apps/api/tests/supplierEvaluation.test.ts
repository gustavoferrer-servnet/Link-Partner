import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateSupplier, initialSupplierManagement, SupplierManagementConflict, supplierManagementOf } from '../src/services/supplierEvaluation.js';
import { seedSuppliers, seedDeliveryProjects, seedUser } from '../src/data/seed.js';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import type { SupplierRecord, SupplierManagement } from '../src/types.js';
const now = new Date('2026-10-13T18:00:00Z');
function supplier(): SupplierRecord { return { ...seedSuppliers[1], management: initialSupplierManagement(now) }; }
function complete(m: SupplierManagement) { m.requirements = m.requirements.map(r => ({ ...r, fulfilled: true, evidence: 'Expediente verificado' })); return m; }
function observation(id: string, metric: SupplierManagement['observations'][number]['metric'], outcome: 'complies' | 'fails' | 'pending', overrides = {}) {
  return { id, metric, reference: id, dueAt: '2026-10-10', completedAt: outcome === 'pending' ? null : '2026-10-10', outcome, evidence: 'Ticket verificable', critical: false, createdBy: 'QA', createdAt: now.toISOString(), ...overrides };
}
test('missing questionnaire does not block provisional habilitation; no history is null, never zero or 100', () => {
  const s = supplier(); s.management = complete(s.management!);
  const result = evaluateSupplier(s, [], now);
  assert.equal(result.score, null); assert.equal(result.confidence, 'Sin historial'); assert.equal(result.recommendation, 'Habilitado provisional');
  const expired = { ...s, management: { ...s.management, requirements: s.management.requirements.map(r => ({ ...r, validUntil: '2026-10-12' })) } };
  assert.equal(evaluateSupplier(expired, [], now).recommendation, 'En validación inicial');
  assert.equal(supplierManagementOf({ ...seedSuppliers[1] }).validationDue, '2026-10-27');
});
test('90-day weighted score, coverage and sparse evidence; overdue open cases count, future and old cases do not', () => {
  const s = supplier(); s.management = complete(s.management!);
  s.management.observations = [observation('a', 'availability', 'complies'), observation('b', 'resolution', 'pending'), observation('c', 'quality', 'complies'), observation('future', 'response', 'pending', { dueAt: '2026-10-20' }), observation('old', 'resolution', 'fails', { completedAt: '2026-01-01' })];
  const result = evaluateSupplier(s, [], now);
  assert.equal(result.coverage, 65); assert.equal(result.score, 62); assert.equal(result.confidence, 'Limitada');
  assert.equal(result.metrics.find(m => m.id === 'resolution')!.evaluated, 1);
  assert.equal(result.recommendation, 'Restringido para nuevas contrataciones');
  assert.equal(result.metrics.find(m => m.id === 'response')!.pending, 1);
});
test('automatic Service Delivery evidence includes overdue open projects, excludes cancelled, and uses original commitment', () => {
  const s = supplier();
  const p = { ...seedDeliveryProjects[0], syncStatus: 'Sincronizado' as const, provider: s.name, originalCommitment: '2026-10-01', currentCommitment: '2026-11-01', actualDeliveryDate: null };
  const result = evaluateSupplier(s, [p, { ...p, id: 'cancelled', operationalStatus: 'Cancelado' }], now);
  assert.equal(result.metrics.find(m => m.id === 'delivery')!.score, 0);
  assert.equal(result.deliveryEvidence.length, 1);
  assert.equal(evaluateSupplier(s, [{ ...p, syncStatus: 'Simulado' }], now).score, null);
  assert.equal(evaluateSupplier(s, [{ ...p, actualDeliveryDate: '2026-10-02' }], now).metrics.find(m => m.id === 'delivery')!.score, 0);
  s.management!.observations.push(observation('manual', 'delivery', 'complies', { reference: p.id }));
  assert.equal(evaluateSupplier(s, [p], now).metrics.find(m => m.id === 'delivery')!.evaluated, 1);
});
test('sufficient evidence can recommend full habilitation; unresolved critical issue overrides excellent average until corrective closure', () => {
  const s = supplier(); s.management = complete(s.management!);
  for (const metric of ['availability', 'resolution', 'delivery', 'quality'] as const) for (let i = 0; i < 5; i++) s.management.observations.push(observation(`${metric}-${i}`, metric, 'complies'));
  assert.equal(evaluateSupplier(s, [], now).recommendation, 'Habilitado');
  s.management.observations[0].critical = true;
  assert.equal(evaluateSupplier(s, [], now).recommendation, 'Restringido para nuevas contrataciones');
  s.management.actions.push({ id: s.management.observations[0].id, description: 'Corregir hallazgo', owner: 'Gestor', dueAt: '2026-10-13', status: 'Cerrada', evidence: 'Verificado' });
  assert.equal(evaluateSupplier(s, [], now).recommendation, 'Habilitado');
});
test('file persistence survives reload and rejects stale concurrent updates without losing evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'supplier-scorecard-'));
  try {
    const file = join(directory, 'state.json'); const repo = new FileRepository(file); const s = supplier();
    const m = complete(s.management!); m.version = 1; m.owner = 'Gestor';
    await repo.saveSupplierManagement(s.id, m, 0, seedUser);
    const concurrent = await Promise.allSettled([repo.saveSupplierManagement(s.id, { ...m, version: 2 }, 1, seedUser), repo.saveSupplierManagement(s.id, { ...m, version: 2, owner: 'Otro gestor' }, 1, seedUser)]);
    assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
    const failed = concurrent.find(r => r.status === 'rejected'); assert.ok(failed?.status === 'rejected' && failed.reason instanceof SupplierManagementConflict);
    const saved = (await new FileRepository(file).listSuppliers(seedUser)).find(item => item.id === s.id)!;
    assert.equal(saved.management!.version, 2); assert.equal(saved.management!.owner, 'Gestor');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('API lifecycle: requirements, provisional authorization, duplicates, critical guardrail, stale revision and manager permissions', async () => {
  const s = await repository.createSupplier({ ...supplier(), id: 'SUP-SCORECARD-QA', name: 'ScoreCard QA' }, seedUser);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/suppliers/${s.id}/management`;
  const call = (version: number, action: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, action }) });
  try {
    const m = complete(s.management!);
    const requirement = { type: 'requirements', ownerAuthUid: seedUser.authUid, validationDue: m.validationDue, nextReview: m.nextReview, nextCapacityReview: m.nextCapacityReview, requirements: m.requirements.map(({ label, ...r }) => r) };
    assert.equal((await call(0, { ...requirement, ownerAuthUid: 'invented-user' })).status, 400);
    assert.equal((await call(0, requirement)).status, 200);
    assert.equal((await call(0, requirement)).status, 409);
    assert.equal((await repository.listSuppliers(seedUser)).find(item => item.id === s.id)!.management!.ownerUser!.authUid, seedUser.authUid);
    const managerRoles = seedUser.roles; seedUser.roles = ['supplier_manager'];
    try { assert.equal((await call(1, { type: 'authorize', state: 'Habilitado provisional', reason: 'Requisitos verificados para piloto' })).status, 403); } finally { seedUser.roles = managerRoles; }
    assert.equal((await call(1, { type: 'authorize', state: 'Habilitado', reason: 'Requisitos completos y verificados' })).status, 400);
    assert.equal((await call(1, { type: 'authorize', state: 'Habilitado provisional', reason: 'Requisitos verificados para piloto' })).status, 200);
    const o = { type: 'observation', metric: 'resolution', reference: 'INC-QA', dueAt: '2026-10-10', completedAt: null, outcome: 'pending', evidence: 'Ticket INC-QA', critical: true };
    assert.equal((await call(2, o)).status, 200); assert.equal((await call(3, o)).status, 409);
    assert.equal((await call(3, { type: 'authorize', state: 'Habilitado provisional', reason: 'Intento con hallazgo crítico' })).status, 400);
    let saved = (await repository.listSuppliers(seedUser)).find(item => item.id === s.id)!;
    assert.equal(saved.management!.history.length, 3);
    const observationId = saved.management!.observations[0].id;
    const previousRoles = seedUser.roles;
    try {
      seedUser.roles = ['noc'];
      assert.equal((await call(3, { ...o, metric: 'quality', reference: 'NOC-WRONG-AREA' })).status, 403);
      seedUser.roles = ['viewer'];
      assert.equal((await call(3, { type: 'contract', sla: '99.95%', contractEnd: '2027-10-13' })).status, 403);
    } finally { seedUser.roles = previousRoles; }
    assert.equal((await call(3, { type: 'contract', sla: '99.95%', contractEnd: '2027-10-13' })).status, 200);
    assert.equal((await call(4, { type: 'close-action', id: observationId, evidence: 'Acción correctiva validada' })).status, 200);
    assert.equal((await call(5, { type: 'settle-observation', id: observationId, completedAt: '2026-10-11', outcome: 'complies', evidence: 'Cierre fuera del plazo' })).status, 400);
    assert.equal((await call(5, { type: 'settle-observation', id: observationId, completedAt: '2026-10-11', outcome: 'fails', evidence: 'Cierre fuera del plazo' })).status, 200);
    saved = (await repository.listSuppliers(seedUser)).find(item => item.id === s.id)!;
    assert.equal(saved.sla, '99.95%'); assert.equal(saved.contractEnd, '2027-10-13');
    assert.equal(saved.management!.observations[0].outcome, 'fails'); assert.equal(saved.management!.history.length, 6);
    try {
      seedUser.roles = ['operations_manager'];
      assert.equal((await call(6, { type: 'authorize', state: 'Condicionado', reason: 'Seguimiento gerencial del plan correctivo' })).status, 200);
    } finally { seedUser.roles = previousRoles; }

  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('saving multiple tabs is atomic: all changes commit together, validation and permissions never partially commit, stale versions retain prior data', async () => {
  const s = await repository.createSupplier({ ...supplier(), id: 'SUP-TABS-QA', name: 'Tabs QA' }, seedUser);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/suppliers/${s.id}/management`;
  const call = (version: number, actions: object[]) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedVersion: version, actions }) });
  const read = async () => (await repository.listSuppliers(seedUser)).find(item => item.id === s.id)!;
  const m = complete(s.management!);
  const requirements = { type: 'requirements', ownerAuthUid: seedUser.authUid, validationDue: m.validationDue, nextReview: m.nextReview, nextCapacityReview: m.nextCapacityReview, requirements: m.requirements };
  const contract = { type: 'contract', sla: 'SLA de prueba 99.95%', contractEnd: '2027-10-13' };
  try {
    assert.equal((await call(0, [contract, { ...requirements, requirements: m.requirements.map(r => ({ ...r, evidence: '' })) }])).status, 400);
    assert.equal((await read()).sla, s.sla); assert.equal((await read()).management!.version, 0);
    const priorRoles = seedUser.roles;
    try { seedUser.roles = ['supplier_manager']; assert.equal((await call(0, [contract, { type: 'authorize', state: 'Habilitado provisional', reason: 'No debe autorizar un gestor' }])).status, 403); } finally { seedUser.roles = priorRoles; }
    assert.equal((await read()).sla, s.sla);
    const observation = { type: 'observation', metric: 'resolution', reference: 'BATCH-DUP', dueAt: '2026-10-10', completedAt: '2026-10-10', outcome: 'complies', evidence: 'Ticket verificado', critical: false };
    assert.equal((await call(0, [observation, observation])).status, 409);
    assert.equal((await read()).management!.observations.length, 0);
    assert.equal((await call(0, [requirements, contract, { type: 'action', description: 'Seguimiento conjunto', owner: 'Responsable QA', dueAt: '2026-10-20' }])).status, 200);
    const saved = await read(); assert.equal(saved.management!.version, 1); assert.equal(saved.management!.history.length, 3); assert.equal(saved.management!.ownerUser!.authUid, seedUser.authUid); assert.equal(saved.sla, contract.sla); assert.equal(saved.management!.actions.length, 1);
    assert.equal((await call(0, [{ ...contract, sla: 'Cambio obsoleto' }])).status, 409);
    assert.deepEqual(await read(), saved);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

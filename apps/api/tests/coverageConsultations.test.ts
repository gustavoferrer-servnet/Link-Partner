import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { FileRepository } from '../src/repositories/FileRepository.js';
import { seedUser } from '../src/data/seed.js';
import type { SupplierCoverageRecord } from '../src/types.js';

test('saved coverage preserves MW/FO evidence, actor, selected map revisions, and one proposal draft', async () => {
  const feature = (technology: string) => ({ type: 'Feature', properties: { technology, name: 'OnNet' }, geometry: { type: 'Polygon', coordinates: [[[0,0],[2,0],[2,2],[0,2],[0,0]]] } });
  const map: SupplierCoverageRecord = { id: 'coverage-save-qa', supplierId: 'SUP-SERVNET', supplierName: 'Red Servnet', sourceFileName: 'MW-FO.kmz', color: '#123456', featureCount: 2, polygonCount: 2, updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'qa', data: { type: 'FeatureCollection', features: [feature('MW'), feature('FO')] } };
  const first = await repository.upsertSupplierCoverage(map, seedUser, null);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1`;
  const post = (path: string, body: unknown) => fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const input = { requestId: randomUUID(), latitude: 1, longitude: 1, address: 'Punto de prueba 1, 1', siteName: 'Sitio de prueba', capacityMbps: 100, coverageSelection: [{ id: first.id, revisionId: first.mapVersion!.revisionId, featureIndexes: [0,1] }] };
  try {
    const savedResponse = await post('/coverage/consultations', input); assert.equal(savedResponse.status, 201);
    const opportunity = (await savedResponse.json()).data;
    assert.match(opportunity.id, /^OPP-COVERAGE-[A-Z2-9]{6}$/);
    assert.deepEqual(opportunity.prefeasibility.createdBy, { authUid: seedUser.authUid, email: seedUser.email, displayName: seedUser.displayName });
    assert.deepEqual(opportunity.prefeasibility.coverage.technologies.map((result: {technology: string; status: string}) => [result.technology, result.status]), [['MW', 'AVAILABLE'], ['FO', 'AVAILABLE']]);
    assert.equal(opportunity.prefeasibility.coverage.versions[0].revisionId, first.mapVersion!.revisionId);
    const duplicate = await Promise.all([post('/coverage/consultations', input), post('/coverage/consultations', input)]);
    for (const response of duplicate) { assert.equal(response.status, 201); assert.equal((await response.json()).data.id, opportunity.id); }
    assert.equal((await post('/coverage/consultations', { ...input, siteName: 'Otro sitio' })).status, 409);
    assert.equal((await post('/coverage/consultations', { ...input, requestId: randomUUID(), createdBy: { authUid: 'spoofed' } })).status, 400);
    const proposalResponse = await post(`/opportunities/${opportunity.id}/proposals`, {}); assert.equal(proposalResponse.status, 201);
    const proposal = (await proposalResponse.json()).data;
    assert.equal(proposal.status, 'Propuesta'); assert.equal(proposal.proposalDraft.status, 'PRICING_PENDING');
    assert.equal(proposal.proposalDraft.createdBy.authUid, seedUser.authUid);
    assert.deepEqual(proposal.prefeasibility, opportunity.prefeasibility);
    assert.deepEqual((await (await post(`/opportunities/${opportunity.id}/proposals`, {})).json()).data.proposalDraft, proposal.proposalDraft);
    const changed = await repository.upsertSupplierCoverage({ ...map, data: { type: 'FeatureCollection', features: [feature('FO')] }, featureCount: 1, polygonCount: 1 }, seedUser, first.mapVersion!.revisionId);
    assert.notEqual(changed.mapVersion!.revisionId, first.mapVersion!.revisionId);
    const retired = await post('/coverage/consultations', { ...input, requestId: randomUUID() }); assert.equal(retired.status, 409); assert.equal((await retired.json()).code, 'COVERAGE_REVISION_CONFLICT');
    const historical = (await (await fetch(`${url}/opportunities/${opportunity.id}`)).json()).data;
    assert.deepEqual(historical.prefeasibility, opportunity.prefeasibility);
    assert.ok((await repository.listOpportunities(seedUser)).some(item => item.id === opportunity.id));
    const viewer = { ...seedUser, roles: ['viewer'] as typeof seedUser.roles };
    assert.equal(await repository.createOpportunityProposal(opportunity.id, viewer), null);
    const getUser = repository.getUserByAuthUid.bind(repository);
    repository.getUserByAuthUid = async () => viewer;
    try { assert.equal((await post('/coverage/consultations', { ...input, requestId: randomUUID() })).status, 403); assert.equal((await post(`/opportunities/${opportunity.id}/proposals`, {})).status, 403); }
    finally { repository.getUserByAuthUid = getUser; }

    const directory = await mkdtemp(join(tmpdir(), 'lp-coverage-save-'));
    try {
      const file = join(directory, 'state.json'); const persistent = new FileRepository(file);
      const record = await repository.getConsultation(opportunity.consultationCode); assert.ok(record);
      await persistent.createConsultation({ ...record, opportunity: { ...record.opportunity, proposalDraft: undefined } });
      await persistent.createOpportunityProposal(opportunity.id, seedUser);
      const restarted = new FileRepository(file); const restored = await restarted.getOpportunity(opportunity.id, seedUser);
      assert.deepEqual(restored?.prefeasibility, opportunity.prefeasibility); assert.equal(restored?.proposalDraft?.id, proposal.proposalDraft.id);
    } finally { await rm(directory, { recursive: true, force: true }); }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

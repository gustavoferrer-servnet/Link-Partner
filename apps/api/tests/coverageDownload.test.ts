import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { seedUser } from '../src/data/seed.js';
import type { SupplierCoverageRecord } from '../src/types.js';

test('individual downloads preserve exact geometry and reject a retired revision', async () => {
  const map: SupplierCoverageRecord = { id: 'download-qa', supplierId: 'SUP-SERVNET', supplierName: 'Red Servnet', sourceFileName: 'FO.kmz', color: '#123456', featureCount: 1, polygonCount: 1, updatedAt: '2026-10-01T00:00:00Z', updatedBy: 'qa', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'OnNet' }, geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }] } };
  const first = await repository.upsertSupplierCoverage(map, seedUser, null);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.on('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/v1/supplier-coverages`;
  try {
    const downloaded = await fetch(`${url}/${map.id}?revision=${first.mapVersion!.revisionId}`);
    assert.equal(downloaded.status, 200);
    assert.equal(downloaded.headers.get('cache-control'), 'no-store');
    assert.deepEqual((await downloaded.json()).data.data, map.data);
    const next = await repository.upsertSupplierCoverage({ ...map, data: { ...map.data, features: [{ ...map.data.features[0], geometry: { type: 'Polygon', coordinates: [[[10,0],[11,0],[11,1],[10,0]]] } }] } }, seedUser, first.mapVersion!.revisionId);
    const stale = await fetch(`${url}/${map.id}?revision=${first.mapVersion!.revisionId}`);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'COVERAGE_REVISION_CONFLICT');
    const current = await fetch(`${url}/${map.id}?revision=${next.mapVersion!.revisionId}`);
    assert.equal(current.status, 200);
    assert.deepEqual((await current.json()).data.data, next.data);
    assert.equal((await fetch(`${url}/missing`)).status, 404);
    assert.equal(await repository.getSupplierCoverage(map.id, { ...seedUser, roles: [] }), null);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

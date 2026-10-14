import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCoverage, publicConsultation, internalConsultation } from '../src/services/prefeasibility.js';
import { pointDistanceMeters } from '../src/services/coverageGeometry.js';
import { coverageResponse } from '../src/services/coverageEngine.js';
import type { ConsultationRecord, SupplierCoverageRecord } from '../src/types.js';
import { app } from '../src/app.js';
import { repository } from '../src/repositories/index.js';
import { seedUser } from '../src/data/seed.js';

const input: ConsultationRecord['input'] = { channel: 'ENTERPRISE', address: 'Sitio de prueba', city: 'Ciudad de prueba', product: 'Internet dedicado', capacityMbps: 100, latitude: 0, longitude: 0 };
const square = (extent = .1) => ({ type: 'Polygon', coordinates: [[[-extent,-extent],[extent,-extent],[extent,extent],[-extent,extent],[-extent,-extent]]] });
const feature = (geometry: unknown, properties: Record<string, unknown> = {}) => ({ type: 'Feature', geometry, properties });
const point = (longitude: number, latitude: number, name?: string) => feature({ type:'Point', coordinates:[longitude,latitude] }, { name, __linkPartnerLayerPath:['PoPs MW'] });
function layer(features: Record<string, unknown>[], overrides: Partial<SupplierCoverageRecord> = {}): SupplierCoverageRecord {
  return { id:'test-mw', supplierId:'SUP-MW', supplierName:'Proveedor MW', sourceFileName:'cobertura-microondas.kmz', color:'#123456', featureCount:features.length, polygonCount:1, updatedAt:'2026-10-09T00:00:00Z', updatedBy:'test', data:{type:'FeatureCollection',features}, ...overrides };
}
const mw = (coverage: ConsultationRecord['coverage']) => coverage.technologies!.find(result => result.technology === 'MW')!;

test('MW requires polygon containment even when a PoP is nearby; FO map containment remains independent', () => {
  const coverage = layer([feature(square()), point(.08,0,'Torre Norte')]);
  const inside = checkCoverage(input,[coverage]);
  assert.equal(mw(inside).status,'AVAILABLE');
  assert.equal(mw(inside).insideCoverage,true);
  assert.equal(mw(inside).distanceMeters,0);
  assert.ok(mw(inside).nearestPop!.distanceMeters > 8800);
  assert.equal(mw(inside).nearestPop!.name,'Torre Norte');
  const outside = checkCoverage({...input,longitude:.101},[coverage]);
  assert.equal(mw(outside).status,'NO_COVERAGE');
  assert.ok(mw(outside).distanceMeters! < 500);
  assert.equal(outside.status,'NO_COVERAGE');
  assert.deepEqual(outside.providerIds,[]);
  const fiber = layer([feature(square(.2))], {id:'test-fo',sourceFileName:'fibra-optica.kmz'});
  const combined = checkCoverage({...input,longitude:.101},[coverage,fiber]);
  assert.equal(combined.status,'AVAILABLE');
  assert.equal(mw(combined).status,'NO_COVERAGE');
  assert.equal(combined.technologies!.find(result => result.technology === 'FO')!.status,'AVAILABLE');
});

test('MW respects polygon holes, boundaries, multipolygons and malformed polygons', () => {
  const geometry = square();
  geometry.coordinates.push([[-.02,-.02],[.02,-.02],[.02,.02],[-.02,.02],[-.02,-.02]]);
  assert.equal(mw(checkCoverage(input,[layer([feature(geometry),point(0,0,'En el hueco')])])).status,'NO_COVERAGE');
  assert.equal(mw(checkCoverage({...input,longitude:.1},[layer([feature(geometry)])])).status,'AVAILABLE');
  assert.equal(mw(checkCoverage(input,[layer([feature({type:'MultiPolygon',coordinates:[square().coordinates]})])])).status,'AVAILABLE');
  for (const invalid of [
    {type:'Polygon',coordinates:[[[0,0],[1,1],[0,0]]]},
    {type:'Polygon',coordinates:[[[0,0],[0,0],[0,0],[0,0]]]},
    {type:'Polygon',coordinates:[[[0,0],[1,0],[1,1],[0,1]]]},
  ]) assert.equal(mw(checkCoverage(input,[layer([feature(invalid)])])).status,'PENDING');
});

test('PoPs are ranked by straight-line distance, deduplicated, and additional points must be within MW coverage and display radius', () => {
  const main = layer([feature(square(.5)),point(.001,0,'Más cercano'),point(.001,0,'Duplicado'),point(.03,0,'Tercero'),point(.02,0,'Segundo'),point(.4,0,'Lejano'),point(.6,0,'Fuera de mancha')]);
  const result = mw(checkCoverage(input,[main]));
  assert.equal(result.nearestPop!.name,'Más cercano');
  assert.ok(Math.abs(result.nearestPop!.distanceMeters-111.195)<.01);
  assert.deepEqual(result.nearbyPops!.map(pop=>pop.name),['Segundo','Tercero']);
  assert.ok(result.nearbyPops!.every(pop=>pop.insideCoverage));
  assert.equal(result.nearbyPopRadiusMeters,25000);
  const many = mw(checkCoverage(input,[layer([feature(square()),...Array.from({length:8},(_,i)=>point((i+1)*.001,0,`PoP ${i}`))])]));
  assert.equal(many.nearbyPops!.length,5);
  const other = layer([point(0,0,'Otro proveedor')], {supplierId:'SUP-OTHER',supplierName:'Otra red'});
  const combined = checkCoverage(input,[main,other]);
  assert.equal(combined.suppliers!.find(s=>s.supplierId==='SUP-MW')!.technologies!.find(t=>t.technology==='MW')!.nearestPop!.name,'Más cercano');
  assert.equal(mw(combined).nearestPop!.name,'Más cercano');
});

test('nested KMZ points keep their name or technical reference without inventing PoP names; point-only MW remains pending', () => {
  const geometry = {type:'GeometryCollection',geometries:[square(),{type:'GeometryCollection',geometries:[{type:'Point',coordinates:[.01,0,100]}]}]};
  const unnamed = mw(checkCoverage(input,[layer([feature(geometry,{name:'COB_RD.58'})])]));
  assert.equal(unnamed.status,'AVAILABLE');
  assert.equal(unnamed.nearestPop!.name,null);
  assert.equal(unnamed.nearestPop!.reference,'COB_RD.58');
  assert.equal(unnamed.nearestPop!.kind,'NETWORK_REFERENCE');
  const named = mw(checkCoverage(input,[layer([feature(geometry,{name:'COB_RD.58',pop_name:'Torre Querétaro'})])]));
  assert.equal(named.nearestPop!.name,'Torre Querétaro');
  assert.equal(named.nearestPop!.kind,'POP');
  const pointOnly = checkCoverage(input,[layer([point(0,0,'PoP sin mancha')])]);
  assert.equal(mw(pointOnly).status,'PENDING');
  assert.equal(pointOnly.status,'PENDING');
  const foPop = layer([feature({type:'Point',coordinates:[.001,0]},{name:'PoP FO',__linkPartnerLayerPath:['PoPs FO']})],{id:'pop-fo',sourceFileName:'general.kml'});
  assert.equal(mw(checkCoverage(input,[layer([feature(square())]),foPop])).nearestPop!.technology,'FO');
});

test('PoP data survives API projection and saved consultation serialization', () => {
  const coverage = checkCoverage(input,[layer([feature(square()),point(.01,0,'PoP A'),point(.02,0,'PoP B')])]);
  const response = coverageResponse(coverage);
  assert.equal(response.policyVersion,'lp-map-v3');
  assert.equal(response.microwavePolicy.feasibility,'inside-polygon');
  assert.equal(response.suppliers[0].technologies![0].nearestPop!.name,'PoP A');
  const saved = JSON.parse(JSON.stringify({ input, code:'ABCDEFGH', coverage, opportunity:{id:'test'}, pricing:{status:'PENDING'}, createdAt:'2026-10-09' })) as ConsultationRecord;
  assert.equal(publicConsultation(saved).coverage.technologies[0].nearestPopDistanceMeters, Math.round(coverage.technologies![0].nearestPop!.distanceMeters));
  assert.doesNotMatch(JSON.stringify(publicConsultation(saved)), /PoP A|PoP B|supplierName|sourceFileName|nearbyPops/);
  const projected = internalConsultation(saved);
  assert.equal(projected.coverage.technologies![0].nearestPop!.name,'PoP A');
  assert.equal(projected.coverage.suppliers![0].technologies![0].nearbyPops![0].name,'PoP B');
});

test('PoP great-circle distance handles the date line', () => {
  const distance=pointDistanceMeters({lat:0,lng:179},{lat:0,lng:-179});
  assert.ok(Math.abs(distance-222390.16)<1);
});

test('authenticated coverage API respects selected features and rejects unavailable or stale revisions', async () => {
  const activeMap = await repository.upsertSupplierCoverage(layer([feature(square()), point(.01,0,'PoP visible')], {supplierId:'SUP-SERVNET',supplierName:'Red Servnet'}), seedUser);
  const server = app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.on('listening',resolve));
  const address=server.address();
  assert.ok(address && typeof address !== 'string');
  const url=`http://127.0.0.1:${address.port}/api/v1/coverage/check`;
  const query=async (coverageSelection?: unknown) => {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({latitude:0,longitude:0,...(coverageSelection === undefined ? {} : {coverageSelection})})});
    return {status:response.status,body:await response.json()};
  };
  try {
    const full=await query();
    assert.equal(full.status,200);
    assert.equal(full.body.data.technologies[0].nearestPop.name,'PoP visible');
    const polygonOnly=await query([{id:'test-mw',revisionId:activeMap.mapVersion!.revisionId,featureIndexes:[0]}]);
    assert.equal(polygonOnly.body.data.technologies[0].status,'AVAILABLE');
    assert.equal(polygonOnly.body.data.technologies[0].nearestPop,null);
    const pointOnly=await query([{id:'test-mw',revisionId:activeMap.mapVersion!.revisionId,featureIndexes:[1]}]);
    assert.equal(pointOnly.body.data.technologies[0].status,'PENDING');
    assert.equal((await query([{id:'unavailable-supplier',revisionId:'old',featureIndexes:[0]}])).status,409);
    assert.equal((await query([{id:'test-mw',revisionId:'old',featureIndexes:[0]}])).status,409);
    assert.equal((await query([{id:'test-mw',revisionId:activeMap.mapVersion!.revisionId,featureIndexes:[-1]}])).status,400);
  } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error ? reject(error) : resolve())); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCoverage } from '../src/services/prefeasibility.js';
import { featureNetworkClassification } from '../src/services/fiberCoverage.js';
import type { ConsultationRecord, SupplierCoverageRecord } from '../src/types.js';

const input: ConsultationRecord['input'] = { channel:'ENTERPRISE', address:'Prueba', city:'Prueba', product:'Internet dedicado', capacityMbps:100, latitude:0, longitude:0 };
const square = (min: number, max: number) => ({ type:'Polygon', coordinates:[[[min,min],[max,min],[max,max],[min,max],[min,min]]] });
const layer = (features: Record<string, unknown>[]): SupplierCoverageRecord => ({ id:'fo', supplierId:'SUP-SERVNET', supplierName:'Red Servnet', sourceFileName:'OnNet y NearNet.kmz', color:'#123456', featureCount:features.length, polygonCount:features.length, updatedAt:'2026-10-09T00:00:00Z', updatedBy:'test', data:{type:'FeatureCollection',features} });
const fo = (record: SupplierCoverageRecord, longitude = 0, latitude = 0) => checkCoverage({...input,longitude,latitude},[record]).technologies!.find(t => t.technology === 'FO')!;
test('FO uses map labels and containment; nearby distances never extend the map', () => {
  const map = layer([{ geometry:square(-.01,.01), properties:{name:'OnNet'} }, {geometry:square(.01,.1),properties:{__linkPartnerLayerPath:['Red','NearNet']}}]);
  assert.equal(fo(map).status,'AVAILABLE');
  assert.equal(fo(map,.05,.05).classification,'near-net');
  assert.equal(fo(map,.05,.05).status,'PENDING');
  // Just outside the existing area is off-net, even though the edge is only ~11 m away.
  const outside = fo(map,.1001,.05);
  assert.equal(outside.status,'NO_COVERAGE');
  assert.equal(outside.insideCoverage,false);
  assert.ok(outside.distanceMeters! < 20);
  assert.equal(fo(layer([{geometry:square(-1,1)}]),.8,.8).status,'AVAILABLE');
});
test('FO respects specific metadata, overlap priority, holes, boundaries and nested polygons', () => {
  assert.equal(featureNetworkClassification({properties:{classification:'Near Net',name:'OnNet'}},'OnNet.kmz'),'near-net');
  assert.equal(featureNetworkClassification({properties:{__linkPartnerLayerPath:['OnNet y NearNet','NearNet','Sector'] }},'mapa.kmz'),'near-net');
  assert.equal(featureNetworkClassification({properties:{nivel_estimado:'OffNet'}},'OnNet.kmz'),'off-net');
  const overlapping = layer([{geometry:square(-1,1),properties:{name:'NearNet'}},{geometry:square(-.1,.1),properties:{name:'OnNet'}}]);
  assert.equal(fo(overlapping).classification,'on-net');
  const area = square(-1,1); area.coordinates.push(square(-.1,.1).coordinates[0]);
  assert.equal(fo(layer([{geometry:area}])).status,'NO_COVERAGE');
  assert.equal(fo(layer([{geometry:area}]),1,0).status,'AVAILABLE');
  assert.equal(fo(layer([{geometry:{type:'GeometryCollection',geometries:[{type:'MultiPolygon',coordinates:[square(-1,1).coordinates]}]}}])).status,'AVAILABLE');
  assert.equal(fo(layer([{geometry:square(-1,1),properties:{name:'OffNet'}}])).status,'NO_COVERAGE');
});
test('FO points, lines, malformed polygons and MW areas cannot manufacture FO coverage', () => {
  for (const geometry of [{type:'Point',coordinates:[0,0]},{type:'LineString',coordinates:[[-1,0],[1,0]]},{type:'Polygon',coordinates:[[[0,0],[1,1],[0,0]]]}]) {
    const result = fo(layer([{geometry}])); assert.equal(result.status,'PENDING'); assert.equal(result.distanceMeters,null);
  }
  const result = fo(layer([{geometry:square(-1,1),properties:{technology:'MW'}}]));
  assert.equal(result.status,'NO_COVERAGE');
});

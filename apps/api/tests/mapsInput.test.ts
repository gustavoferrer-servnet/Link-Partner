import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseMapsInput, allowedMapsUrl } from '../src/services/mapsInput.js';
import { locationSuggestions } from '../src/services/mapsLocation.js';
import { verifyLocation } from '../src/services/addressValidation.js';
import { config } from '../src/config.js';

test('Google DD, DMS and DMM formats preserve the entered point, including west/south and Unicode symbols', () => {
  for (const input of ['19.4281234, -99.1612345', '(19.4281234, -99.1612345)', '19.4281234 -99.1612345', '19.4281234, −99.1612345']) {
    assert.deepEqual(parseMapsInput(input), {kind:'coordinates',latitude:19.4281234,longitude:-99.1612345});
  }
  for (const input of ['19°25\'30"N 99°09\'40"W', '19°25′30″N, 99°09′40″O', '19 25.5, -99 9.6666666667']) {
    const point = parseMapsInput(input); assert.equal(point.kind,'coordinates');
    if (point.kind !== 'coordinates') throw new Error(input);
    assert.ok(Math.abs(point.latitude - 19.425) < 1e-8);
    assert.ok(Math.abs(point.longitude + 99.1611111111) < 1e-8);
  }
  assert.deepEqual(parseMapsInput('19°30′S 99°15′E'), {kind:'coordinates',latitude:-19.5,longitude:99.25});
});
test('Google links prefer the final marked destination over the camera and support query, place, and search URLs', () => {
  const point = {kind:'coordinates',latitude:19.425,longitude:-99.16};
  for (const input of [
    'https://www.google.com/maps/search/?api=1&query=19.425%2C-99.16',
    'https://maps.google.com/?q=19.425,-99.16',
    'https://www.google.com.mx/maps/place/Reforma/@20,-100,15z/data=!3d18!4d-98!3d19.425!4d-99.16',
    'https://www.google.com/maps/@19.425,-99.16,15z',
    'https://www.google.com/maps/place/19.425,-99.16',
    'https://www.google.com/maps/dir/?api=1&destination=19.425,-99.16',
  ]) assert.deepEqual(parseMapsInput(input),point);
  assert.deepEqual(parseMapsInput('https://www.google.com/maps/search/?api=1&query=Reforma+222+CDMX'),{kind:'address',address:'Reforma 222 CDMX'});
  assert.deepEqual(parseMapsInput('https://www.google.com/maps/search/?api=1&query=Reforma&query_place_id=ChIJ222'),{kind:'place',placeId:'ChIJ222'});
  assert.deepEqual(parseMapsInput('Av. Paseo de la Reforma 222, Ciudad de México'),{kind:'address',address:'Av. Paseo de la Reforma 222, Ciudad de México'});
});
test('Malformed coordinates and untrusted URLs are rejected instead of being searched as addresses', () => {
  for (const input of ['91,-99','19,-181','19°60′N 99°15′W','19°25.2′30″N 99°15′W','-19N,99E','99W,19N','https://www.google.com/maps?q=200,-99','https://www.google.com/maps/@91,-99,14z','https://www.google.com/maps?ll=91,-99']) {
    assert.equal(parseMapsInput(input).kind,'invalid',input);
  }
  for (const url of ['http://maps.app.goo.gl/abc','https://maps.app.goo.gl.evil.test/abc','https://google.com@127.0.0.1/maps','https://maps.app.goo.gl:8081/abc','https://google.com/other','https://127.0.0.1/maps']) {
    assert.equal(allowedMapsUrl(url),null,url);
    assert.equal(parseMapsInput(url).kind,'invalid',url);
  }
});
const locality = {places:[{addressComponents:[{longText:'México',shortText:'MX',types:['country']},{longText:'Ciudad de México',types:['locality']}],location:{latitude:20,longitude:-100},formattedAddress:'A nearby business, not the entered point'}]};
test('Coordinate resolution signs the exact point, uses nearby Google results only for locality and exposes no key', async () => {
  const originalFetch = globalThis.fetch, originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-private-key';
  let calls = 0;
  globalThis.fetch = async (url,init) => {
    calls++; assert.equal(String(url),'https://places.googleapis.com/v1/places:searchNearby');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.locationRestriction.circle.center,{latitude:19.4281234,longitude:-99.1612345});
    assert.equal(body.rankPreference,'DISTANCE');
    return new Response(JSON.stringify(locality));
  };
  try {
    const [candidate] = await locationSuggestions('19.4281234, -99.1612345','');
    assert.equal(calls,1); assert.ok('token' in candidate);
    if (!('token' in candidate)) throw new Error('Expected a confirmed candidate');
    assert.equal(candidate.latitude,19.4281234); assert.equal(candidate.longitude,-99.1612345);
    assert.equal(verifyLocation(candidate.token)?.latitude,19.4281234);
    assert.equal(verifyLocation(candidate.token)?.originalAddress,'19.4281234, -99.1612345');
    assert.equal(candidate.city,'Ciudad de México');
    assert.equal(JSON.stringify(candidate).includes('nearby business'),false);
    assert.equal(JSON.stringify(candidate).includes('test-private-key'),false);
  } finally { globalThis.fetch = originalFetch; config.googleMapsApiKey = originalKey; }
});
test('Short Maps links resolve with bounded manual redirects and reject external redirects before fetching them', async () => {
  const originalFetch = globalThis.fetch, originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-private-key';
  const urls: string[] = [];
  globalThis.fetch = async (url,init) => {
    urls.push(String(url));
    if (String(url).includes('maps.app.goo.gl')) { assert.equal(init?.redirect,'manual'); return new Response(null,{status:302,headers:{location:'https://www.google.com/maps?q=19.4281234,-99.1612345'}}); }
    return new Response(JSON.stringify(locality));
  };
  try {
    const [candidate] = await locationSuggestions('https://maps.app.goo.gl/test','');
    assert.ok('token' in candidate); assert.equal(urls.length,2);
    urls.length = 0;
    globalThis.fetch = async url => { urls.push(String(url)); return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}}); };
    await assert.rejects(locationSuggestions('https://maps.app.goo.gl/test',''),error => error instanceof Error && 'status' in error && error.status === 422);
    assert.deepEqual(urls,['https://maps.app.goo.gl/test']);
    urls.length = 0;
    globalThis.fetch = async url => { urls.push(String(url)); return new Response(null,{status:302,headers:{location:'https://maps.app.goo.gl/loop'}}); };
    await assert.rejects(locationSuggestions('https://maps.app.goo.gl/test',''));
    assert.equal(urls.length,5);
  } finally { globalThis.fetch = originalFetch; config.googleMapsApiKey = originalKey; }
});
test('Coordinate failures are recoverable and ordinary address searches keep their autocomplete session', async () => {
  const originalFetch = globalThis.fetch, originalKey = config.googleMapsApiKey, originalProvider = config.addressSearchProvider;
  config.googleMapsApiKey = 'test-private-key'; config.addressSearchProvider = 'google';
  try {
    for (const response of [{places:[]},{places:[{addressComponents:[{longText:'United States',shortText:'US',types:['country']}]}]}]) {
      globalThis.fetch = async () => new Response(JSON.stringify(response));
      await assert.rejects(locationSuggestions('19.428,-99.161',''),error => error instanceof Error && 'status' in error && error.status === 422);
    }
    globalThis.fetch = async () => { throw new Error('network failure'); };
    await assert.rejects(locationSuggestions('19.428,-99.161',''),error => error instanceof Error && 'status' in error && error.status === 503);
    const sessionToken = randomUUID();
    globalThis.fetch = async (url,init) => {
      assert.equal(String(url),'https://places.googleapis.com/v1/places:autocomplete');
      assert.equal(JSON.parse(String(init?.body)).sessionToken,sessionToken);
      return new Response(JSON.stringify({suggestions:[{placePrediction:{placeId:'address',text:{text:'Reforma 222, CDMX'}}}]}));
    };
    assert.equal((await locationSuggestions('Reforma 222','',sessionToken))[0].placeId,'address');
  } finally { globalThis.fetch = originalFetch; config.googleMapsApiKey = originalKey; config.addressSearchProvider = originalProvider; }
});

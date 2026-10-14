import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { validateAddress, suggestAddress, verifyLocation } from '../src/services/addressValidation.js';
import { locationSuggestions, validateLocationAddress } from '../src/services/mapsLocation.js';

test('Google handles legacy validation, suggestions and coordinates without calling OSM; failure never falls back', async () => {
  const originalFetch = globalThis.fetch, provider = config.addressSearchProvider, key = config.googleMapsApiKey;
  config.addressSearchProvider = 'google'; config.googleMapsApiKey = 'test-key';
  const calls: string[] = [];
  const city = [{ longText: 'México', shortText: 'MX', types: ['country'] }, { longText: 'Ciudad de México', types: ['locality'] }];
  globalThis.fetch = async url => {
    calls.push(String(url)); assert.equal(new URL(String(url)).hostname, 'places.googleapis.com');
    if (String(url).includes('autocomplete')) return new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: 'place-test', text: { text: 'Reforma 222, Ciudad de México' } } }] }));
    if (String(url).includes('searchNearby')) return new Response(JSON.stringify({ places: [{ addressComponents: city }] }));
    return new Response(JSON.stringify({ id: 'place-test', formattedAddress: 'Reforma 222, Ciudad de México, México', location: { latitude: 19.428, longitude: -99.161 }, addressComponents: city }));
  };
  try {
    const [candidate] = await validateLocationAddress('Reforma 222', 'Ciudad de México');
    assert.equal(verifyLocation(candidate.token)?.provider, 'google');
    assert.equal(calls.length, 2);
    const [point] = await locationSuggestions('19.428, -99.161', '');
    assert.ok('token' in point); assert.equal(verifyLocation(point.token)?.provider, 'google');
    await assert.rejects(validateAddress('Reforma 222', 'Ciudad de México'), error => 'status' in (error as Error) && (error as { status: number }).status === 409);
    await assert.rejects(suggestAddress('Reforma 222'));
    assert.equal(calls.length, 3);
    globalThis.fetch = async url => { calls.push(String(url)); assert.equal(new URL(String(url)).hostname, 'places.googleapis.com'); throw new Error('Google unavailable'); };
    await assert.rejects(validateLocationAddress('Reforma 222', 'Ciudad de México'));
    assert.equal(calls.length, 4);
  } finally { globalThis.fetch = originalFetch; config.addressSearchProvider = provider; config.googleMapsApiKey = key; }
});

test('Explicit OSM mode resolves coordinates with Nominatim and never calls Google Places', async () => {
  const originalFetch = globalThis.fetch, provider = config.addressSearchProvider;
  config.addressSearchProvider = 'photon';
  let calls = 0;
  globalThis.fetch = async url => {
    calls++; const endpoint = new URL(String(url)); assert.equal(endpoint.hostname, new URL(config.geocodingUrl).hostname);
    assert.ok(endpoint.pathname.endsWith('/reverse')); assert.equal(endpoint.searchParams.get('lat'), '19.428');
    return new Response(JSON.stringify({ lat: '20', lon: '-100', address: { country_code: 'mx', city: 'Ciudad de México' } }));
  };
  try {
    const [point] = await locationSuggestions('19.428, -99.161', '');
    assert.ok('token' in point); assert.equal(point.latitude, 19.428); assert.equal(point.longitude, -99.161);
    assert.equal(verifyLocation(point.token)?.provider, 'photon');
    await assert.rejects(locationSuggestions('https://www.google.com/maps/search/?api=1&query=Reforma&query_place_id=place-test', ''));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; config.addressSearchProvider = provider; }
});

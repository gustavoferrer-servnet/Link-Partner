import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../src/config.js';
import { googleSuggestions, resolveGooglePlace } from '../src/services/googlePlaces.js';
import { verifyLocation } from '../src/services/addressValidation.js';

test('Google autocomplete uses one session and resolves only the selected place, without leaking its server key', async () => {
  const original = globalThis.fetch, originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-private-key';
  const sessionToken = randomUUID();
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'), 'test-private-key');
    if (String(url).includes('autocomplete')) return new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: 'place-222', text: { text: 'Reforma 222, Ciudad de México, México' } } }] }));
    return new Response(JSON.stringify({ id: 'place-222', formattedAddress: 'Avenida Paseo de la Reforma 222, Ciudad de México, México', location: { latitude: 19.428, longitude: -99.161 }, addressComponents: [{ longText: 'México', shortText: 'MX', types: ['country'] }, { longText: 'Ciudad de México', types: ['locality'] }, { longText: '222', types: ['street_number'] }] }));
  };
  try {
    const options = await googleSuggestions('Reforma 22', '', sessionToken);
    assert.equal(calls.length, 1);
    assert.equal(options[0].placeId, 'place-222');
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.sessionToken, sessionToken); assert.deepEqual(body.includedRegionCodes, ['mx']);
    const location = await resolveGooglePlace(options[0].placeId, sessionToken, 'Reforma 22', '');
    assert.equal(calls.length, 2); assert.match(calls[1].url, new RegExp(sessionToken));
    assert.equal(location.city, 'Ciudad de México'); assert.equal(location.precision, 'address');
    assert.equal(verifyLocation(location.token)?.provider, 'google');
    assert.equal(verifyLocation(location.token)?.latitude, 19.428);
    assert.equal(JSON.stringify(location).includes('test-private-key'), false);
  } finally { globalThis.fetch = original; config.googleMapsApiKey = originalKey; }
});
test('Google provider rejects foreign places and exposes a recoverable error for rejected credentials', async () => {
  const original = globalThis.fetch, originalKey = config.googleMapsApiKey;
  config.googleMapsApiKey = 'test-key';
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'foreign', formattedAddress: 'Foreign address', location: { latitude: 48, longitude: 2 }, addressComponents: [{ longText: 'France', shortText: 'FR', types: ['country'] }] }));
    await assert.rejects(resolveGooglePlace('foreign', randomUUID(), 'Address', ''), error => error instanceof Error && 'status' in error && error.status === 422);
    globalThis.fetch = async () => new Response('{}', { status: 403 });
    await assert.rejects(googleSuggestions('Reforma', '', randomUUID()), error => error instanceof Error && 'status' in error && error.status === 503);
  } finally { globalThis.fetch = original; config.googleMapsApiKey = originalKey; }
});

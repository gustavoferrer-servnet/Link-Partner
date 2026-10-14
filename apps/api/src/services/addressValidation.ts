import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';

const signingSecret = config.geocodingSigningSecret ?? (config.nodeEnv === 'production' ? null : randomBytes(32).toString('hex'));
const locationSchema = z.object({ provider: z.enum(['google', 'photon']).optional(), placeId: z.string().optional(), address: z.string().min(5).max(1000), city: z.string().min(2).max(200), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), expiresAt: z.number(), originalAddress: z.string(), originalCity: z.string() });
export type ValidatedLocation = z.infer<typeof locationSchema>;
export class AddressValidationError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function signLocation(location: Omit<ValidatedLocation, 'expiresAt'>, expiresAt = Date.now() + 30 * 60_000) {
  if (!signingSecret) throw new AddressValidationError('La validación de dirección no está configurada.');
  const payload = Buffer.from(JSON.stringify({ ...location, expiresAt })).toString('base64url');
  return `${payload}.${createHmac('sha256', signingSecret).update(payload).digest('base64url')}`;
}
export function verifyLocation(token: string): ValidatedLocation | null {
  if (!signingSecret) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', signingSecret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = locationSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
    return parsed.success && parsed.data.expiresAt > Date.now() ? parsed.data : null;
  } catch { return null; }
}
export function normalizeAddress(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().replace(/^av\.?\s+/i, 'Avenida ').replace(/\bCDMX\b/gi, 'Ciudad de México');
}
const providerSchema = z.array(z.object({ lat: z.string(), lon: z.string(), display_name: z.string(), address: z.record(z.string(), z.string()).optional() })).max(10);
type Candidate = { address: string; city: string; latitude: number; longitude: number; precision: 'address' | 'street-or-area' };
const cache = new Map<string, { expiresAt: number; candidates: Candidate[] }>();
let queue: Promise<void> = Promise.resolve();
let lastStarted = 0;
async function osmRequest(endpoint: URL): Promise<unknown> {
  if (config.addressSearchProvider !== 'photon') throw new AddressValidationError('OpenStreetMap no es el proveedor activo.', 409);
  // Serialize all calls and space them by >= 1 second, including cache misses from separate users.
  const pending = queue.then(async () => {
    const delay = Math.max(0, lastStarted + 1100 - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastStarted = Date.now();
    const response = await fetch(endpoint, { headers: { 'User-Agent': config.geocodingUserAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new AddressValidationError('No pudimos validar la dirección. Intenta nuevamente en unos momentos.');
    return response.json();
  });
  queue = pending.then(() => undefined, () => undefined);
  return pending;
}
async function providerSearch(query: string): Promise<Candidate[]> {
    const endpoint = new URL('search', `${config.geocodingUrl.replace(/\/$/, '')}/`);
    endpoint.search = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', countrycodes: 'mx', limit: '5', q: query }).toString();
    const parsed = providerSchema.safeParse(await osmRequest(endpoint));
    if (!parsed.success) throw new AddressValidationError('El servicio de direcciones no devolvió una respuesta válida.');
    return parsed.data.flatMap(value => {
      const latitude = Number(value.lat), longitude = Number(value.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
      const city = value.address?.city || value.address?.town || value.address?.municipality || value.address?.village || value.address?.state;
      if (!city) return [];
      return [{ address: value.display_name, city, latitude, longitude, precision: value.address?.house_number ? 'address' as const : 'street-or-area' as const }];
    });
}
export async function resolveOsmCoordinates(latitude: number, longitude: number, originalAddress: string, originalCity: string) {
  const endpoint = new URL('reverse', `${config.geocodingUrl.replace(/\/$/, '')}/`);
  endpoint.search = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', lat: String(latitude), lon: String(longitude) }).toString();
  const parsed = z.object({ address: z.record(z.string(), z.string()) }).safeParse(await osmRequest(endpoint));
  if (!parsed.success || parsed.data.address.country_code !== 'mx') throw new AddressValidationError('Selecciona una ubicación en México.', 422);
  const parts = parsed.data.address;
  const city = parts.city || parts.town || parts.municipality || parts.village || parts.state;
  if (!city) throw new AddressValidationError('No pudimos identificar la ciudad del punto.', 422);
  const candidate = { address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)} · ${city}, México`, city, latitude, longitude, precision: 'street-or-area' as const, provider: 'photon' as const };
  return { ...candidate, token: signLocation({ ...candidate, originalAddress, originalCity }) };
}
const inFlight = new Map<string, Promise<Candidate[]>>();
export async function validateAddress(address: string, city: string) {
  if (config.addressSearchProvider !== 'photon') throw new AddressValidationError('OpenStreetMap no es el proveedor activo.', 409);
  if (!signingSecret) throw new AddressValidationError('La validación de dirección no está configurada.');
  const query = `${normalizeAddress(address)}, ${normalizeAddress(city)}, México`;
  const cacheKey = query.toLocaleLowerCase('es-MX');
  const cached = cache.get(cacheKey);
  let candidates = cached && cached.expiresAt > Date.now() ? cached.candidates : null;
  if (!candidates) {
    let pending = inFlight.get(cacheKey);
    if (!pending) {
      pending = providerSearch(query);
      inFlight.set(cacheKey, pending);
    }
    try {
      candidates = await pending;
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(cacheKey, { candidates, expiresAt: Date.now() + 24 * 60 * 60_000 });
    } catch (e) {
      if (e instanceof AddressValidationError) throw e;
      throw new AddressValidationError('No pudimos contactar el servicio de direcciones. Revisa la dirección e intenta de nuevo.');
    } finally { inFlight.delete(cacheKey); }
  }
  return candidates.map(candidate => ({ ...candidate, token: signLocation({ ...candidate, originalAddress: address, originalCity: city }) }));
}

const suggestionCache = new Map<string, { expires: number; values: Candidate[] }>();
const suggestionRequests = new Map<string, Promise<Candidate[]>>();
export async function suggestAddress(address: string, city = '') {
  if (config.addressSearchProvider !== 'photon') throw new AddressValidationError('OpenStreetMap no es el proveedor activo.', 409);
  const query = [normalizeAddress(address), normalizeAddress(city)].filter(Boolean).join(', ');
  const key = query.toLocaleLowerCase('es-MX');
  const cached = suggestionCache.get(key);
  let values = cached && cached.expires > Date.now() ? cached.values : null;
  if (!values) {
    let pending = suggestionRequests.get(key);
    if (!pending) {
      pending = (async () => {
        const endpoint = new URL('api/', `${config.addressAutocompleteUrl.replace(/\/$/, '')}/`);
        endpoint.search = new URLSearchParams({ q: query, limit: '5', bbox: '-118.5,14.4,-86.7,32.8' }).toString();
        const response = await fetch(endpoint, { headers: { 'User-Agent': config.geocodingUserAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new AddressValidationError('Las sugerencias no están disponibles. Puedes validar la dirección con el botón.');
        const parsed = z.object({ features: z.array(z.object({ geometry: z.object({ coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]) }), properties: z.record(z.string(), z.unknown()) })).max(10) }).safeParse(await response.json());
        if (!parsed.success) throw new AddressValidationError('Respuesta de sugerencias inválida.');
        return parsed.data.features.flatMap(feature => {
          const p = feature.properties;
          if (p.countrycode !== 'MX' && p.country !== 'México' && p.country !== 'Mexico') return [];
          const city = [p.city, p.town, p.district, p.state].find(value => typeof value === 'string') as string | undefined;
          const street = [p.street, p.housenumber].filter(value => typeof value === 'string').join(' ');
          const address = [...new Set([p.name, street, p.district, city, p.state, p.postcode, p.country].filter(value => typeof value === 'string' && value))].join(', ');
          return city && address.length >= 5 ? [{ address, city, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], precision: p.housenumber ? 'address' as const : 'street-or-area' as const }] : [];
        });
      })();
      suggestionRequests.set(key, pending);
    }
    try {
      values = await pending;
      if (suggestionCache.size >= 500) suggestionCache.delete(suggestionCache.keys().next().value!);
      suggestionCache.set(key, { values, expires: Date.now() + 3600000 });
    } catch (error) {
      if (error instanceof AddressValidationError) throw error;
      throw new AddressValidationError('El buscador de direcciones no está disponible. Intenta nuevamente o valida la dirección con el botón.');
    } finally { suggestionRequests.delete(key); }
  }
  return values.map(candidate => ({ ...candidate, token: signLocation({ ...candidate, originalAddress: address, originalCity: city }) }));
}

import { allowedMapsUrl, parseMapsInput, type MapsInput } from './mapsInput.js';
import { randomUUID } from 'node:crypto';
import { AddressValidationError, resolveOsmCoordinates, validateAddress } from './addressValidation.js';
import { googleSuggestions, resolveGoogleCoordinates, resolveGooglePlace } from './googlePlaces.js';
import { config } from '../config.js';
import { suggestAddress } from './addressValidation.js';
async function expandedInput(input: Extract<MapsInput,{kind:'short-url'}>) {
  let url = input.url;
  try {
    for (let hop = 0; hop < 5; hop++) {
      if (!allowedMapsUrl(url)) throw new AddressValidationError('El enlace no lleva a una ubicación de Google Maps.',422);
      const response = await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(5000)});
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (![301,302,303,307,308].includes(response.status) || !location) throw new AddressValidationError('No pudimos abrir el enlace corto. Copia las coordenadas o el enlace completo de Google Maps.',422);
      url = new URL(location,url).href;
      if (!allowedMapsUrl(url)) throw new AddressValidationError('El enlace no lleva a una ubicación de Google Maps.',422);
      const parsed = parseMapsInput(url);
      if (parsed.kind !== 'short-url') return parsed;
    }
    throw new AddressValidationError('El enlace contiene demasiadas redirecciones. Copia las coordenadas del punto.',422);
  } catch (error) {
    if (error instanceof AddressValidationError) throw error;
    throw new AddressValidationError('No pudimos abrir el enlace corto. Copia las coordenadas o el enlace completo de Google Maps.');
  }
}
export async function locationSuggestions(address: string, city: string, sessionToken?: string) {
  let input = parseMapsInput(address);
  if (input.kind === 'short-url') input = await expandedInput(input);
  if (input.kind === 'invalid') throw new AddressValidationError(input.message,422);
  if (input.kind === 'coordinates') {
    const candidate = await (config.addressSearchProvider === 'google' ? resolveGoogleCoordinates : resolveOsmCoordinates)(input.latitude,input.longitude,address,city);
    return [{...candidate,coordinateInput:true}];
  }
  if (input.kind === 'place') {
    if (config.addressSearchProvider !== 'google') throw new AddressValidationError('Este enlace con identificador de Google requiere activar Google Maps. Puedes ingresar dirección o coordenadas.', 422);
    return [await resolveGooglePlace(input.placeId,undefined,address,city)];
  }
  if (config.addressSearchProvider === 'google') {
    if (!sessionToken) throw new AddressValidationError('Inicia una nueva búsqueda de dirección.',400);
    return googleSuggestions(input.address,city,sessionToken);
  }
  return suggestAddress(input.address,city);
}
export async function validateLocationAddress(address: string, city: string) {
  if (config.addressSearchProvider === 'photon') return validateAddress(address, city);
  const sessionToken = randomUUID();
  const options = await locationSuggestions(address, city, sessionToken);
  const first = options[0];
  if (!first) return [];
  return ['token' in first ? first : await resolveGooglePlace(first.placeId, sessionToken, address, city)];
}

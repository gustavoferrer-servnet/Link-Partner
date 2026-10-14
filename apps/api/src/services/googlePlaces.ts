import { z } from 'zod';
import { config } from '../config.js';
import { AddressValidationError, normalizeAddress, signLocation } from './addressValidation.js';

async function places(path: string, fields: string, init: RequestInit = {}) {
  if (!config.googleMapsApiKey) throw new AddressValidationError('La búsqueda con Google Maps está pendiente de configuración.');
  try {
    const response = await fetch(`https://places.googleapis.com/v1/${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.googleMapsApiKey, 'X-Goog-FieldMask': fields }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new AddressValidationError('Google Maps no pudo completar la búsqueda. Intenta nuevamente.');
    return await response.json();
  } catch (error) {
    if (error instanceof AddressValidationError) throw error;
    throw new AddressValidationError('No pudimos conectar con Google Maps. Intenta nuevamente.');
  }
}
export async function googleSuggestions(address: string, city: string, sessionToken: string) {
  const response = await places('places:autocomplete', 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text', { method: 'POST', body: JSON.stringify({ input: [normalizeAddress(address), normalizeAddress(city)].filter(Boolean).join(', '), includedRegionCodes: ['mx'], languageCode: 'es', regionCode: 'MX', sessionToken }) });
  const parsed = z.object({ suggestions: z.array(z.object({ placePrediction: z.object({ placeId: z.string(), text: z.object({ text: z.string() }) }).optional() })).default([]) }).safeParse(response);
  if (!parsed.success) throw new AddressValidationError('Google Maps no devolvió direcciones válidas.');
  return parsed.data.suggestions.flatMap(({ placePrediction: value }) => value ? [{ placeId: value.placeId, address: value.text.text, provider: 'google' as const }] : []);
}
export async function resolveGooglePlace(placeId: string, sessionToken: string | undefined, originalAddress: string, originalCity: string) {
  const params = new URLSearchParams({ languageCode: 'es', regionCode: 'MX', ...(sessionToken ? {sessionToken} : {}) });
  const response = await places(`places/${encodeURIComponent(placeId)}?${params}`, 'id,formattedAddress,addressComponents,location');
  const parsed = z.object({ id: z.string(), formattedAddress: z.string().min(5), location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }), addressComponents: z.array(z.object({ longText: z.string(), shortText: z.string().optional(), types: z.array(z.string()) })) }).safeParse(response);
  if (!parsed.success) throw new AddressValidationError('Google Maps no devolvió una ubicación válida.');
  const place = parsed.data;
  const component = (type: string) => place.addressComponents.find(value => value.types.includes(type));
  if (component('country')?.shortText !== 'MX') throw new AddressValidationError('Selecciona una dirección en México.', 422);
  const city = component('locality')?.longText || component('administrative_area_level_2')?.longText || component('administrative_area_level_1')?.longText;
  if (!city) throw new AddressValidationError('No pudimos identificar la ciudad de esta dirección.', 422);
  const candidate = { address: place.formattedAddress, city, ...place.location, precision: component('street_number') ? 'address' as const : 'street-or-area' as const, provider: 'google' as const, placeId: place.id };
  return { ...candidate, token: signLocation({ ...candidate, originalAddress, originalCity }) };
}

export async function resolveGoogleCoordinates(latitude: number, longitude: number, originalAddress: string, originalCity: string) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new AddressValidationError('Indica latitud y longitud válidas.',422);
  const response = await places('places:searchNearby','places.formattedAddress,places.addressComponents', {method:'POST',body:JSON.stringify({languageCode:'es',maxResultCount:1,rankPreference:'DISTANCE',locationRestriction:{circle:{center:{latitude,longitude},radius:1500}}})});
  const parsed = z.object({places:z.array(z.object({addressComponents:z.array(z.object({longText:z.string(),shortText:z.string().optional(),types:z.array(z.string())}))})).default([])}).safeParse(response);
  const place = parsed.success ? parsed.data.places[0] : undefined;
  if (!place) throw new AddressValidationError('No encontramos una referencia para este punto. Ingresa la dirección del sitio para validar la ubicación.',422);
  const component = (type: string) => place.addressComponents.find(value=>value.types.includes(type));
  if (component('country')?.shortText !== 'MX') throw new AddressValidationError('Selecciona una ubicación en México.',422);
  const city = component('locality')?.longText || component('administrative_area_level_2')?.longText || component('administrative_area_level_1')?.longText;
  if (!city) throw new AddressValidationError('No pudimos identificar la ciudad del punto. Ingresa la dirección del sitio.',422);
  // A nearby place provides locality context only. Never move the customer's exact point onto its location/address.
  const address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)} · ${city}, México`;
  const candidate = {address,city,latitude,longitude,precision:'street-or-area' as const,provider:'google' as const};
  return {...candidate,token:signLocation({...candidate,originalAddress,originalCity})};
}

export type MapsInput = { kind: 'coordinates'; latitude: number; longitude: number } | { kind: 'address'; address: string } | { kind: 'place'; placeId: string } | { kind: 'short-url'; url: string } | { kind: 'invalid'; message: string };
const invalid = (message = 'Revisa las coordenadas: latitud primero, longitud después y punto decimal.') => ({ kind: 'invalid' as const, message });
function coordinate(value: string, axis: 'lat' | 'lng') {
  const text = value.trim().toUpperCase();
  const direction = text.match(/[NSEWO]$/)?.[0];
  if (direction && !(axis === 'lat' ? ['N','S'] : ['E','W','O']).includes(direction)) return null;
  const numeric = text.replace(/[NSEWO]$/, '').trim().replace(/[°'"′″’”º]/g, ' ').trim();
  if (!/^[+-]?\d+(?:\.\d+)?(?:\s+\d+(?:\.\d+)?){0,2}$/.test(numeric)) return null;
  const parts = numeric.split(/\s+/).map(Number);
  if (parts.length > 1 && (!Number.isInteger(parts[0]) || parts[1] >= 60 || (parts[2] ?? 0) >= 60 || parts.length === 3 && !Number.isInteger(parts[1]))) return null;
  let result = Math.abs(parts[0]) + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  const negative = /^-/.test(numeric);
  if (negative && direction && !['S','W','O'].includes(direction)) return null;
  if (negative || direction && ['S','W','O'].includes(direction)) result = -result;
  return Number.isFinite(result) && Math.abs(result) <= (axis === 'lat' ? 90 : 180) ? result : null;
}
export function parseCoordinates(value: string) {
  const text = value.normalize('NFKC').replace(/−/g, '-').trim().replace(/^\((.*)\)$/s, '$1').trim();
  let pair = text.split(/\s*[,;]\s*/);
  if (pair.length !== 2) {
    const hemispheres = text.match(/^(.+?[NS])\s*(.+?[EWO])$/i);
    const decimals = text.match(/^([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)$/);
    pair = hemispheres ? [hemispheres[1],hemispheres[2]] : decimals ? [decimals[1],decimals[2]] : [];
  }
  if (pair.length !== 2) return null;
  const latitude = coordinate(pair[0],'lat'), longitude = coordinate(pair[1],'lng');
  return latitude === null || longitude === null ? null : { latitude, longitude };
}
export function allowedMapsUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const google = /^(?:www\.|maps\.)?google\.(?:com|com\.mx|es|ca|co\.uk|de|fr)$/.test(host);
    const short = host === 'maps.app.goo.gl' || host === 'goo.gl' && url.pathname.startsWith('/maps/');
    return short || google && (url.pathname.startsWith('/maps') || host.startsWith('maps.')) ? url : null;
  } catch { return null; }
}
export function parseMapsInput(value: string): MapsInput {
  const text = value.trim();
  const coordinates = parseCoordinates(text);
  if (coordinates) return { kind: 'coordinates', ...coordinates };
  if (/^(?:https?:\/\/|www\.|maps\.)/i.test(text)) {
    const url = allowedMapsUrl(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (!url) return invalid('Pega un enlace HTTPS de Google Maps o las coordenadas del punto.');
    if (url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl') return {kind:'short-url',url:url.href};
    let path: string;
    try { path = decodeURIComponent(url.pathname); } catch { return invalid('El enlace de Google Maps no es válido.'); }
    // Pin coordinates take precedence over the camera's @lat,lng. The last pin is the destination in route links.
    const pins = [...`${path} ${url.searchParams.get('data') || ''}`.matchAll(/!3d([+-]?\d+(?:\.\d+)?)!4d([+-]?\d+(?:\.\d+)?)/g)];
    if (pins.length) { const pin = pins[pins.length-1]; const point = parseCoordinates(`${pin[1]},${pin[2]}`); return point ? {kind:'coordinates',...point} : invalid(); }
    const placeId = url.searchParams.get('query_place_id') || url.searchParams.get('place_id');
    if (placeId) return {kind:'place',placeId};
    for (const key of ['destination','daddr','query','q','ll','center']) {
      const query = url.searchParams.get(key); if (!query) continue;
      if (query.startsWith('place_id:')) return {kind:'place',placeId:query.slice(9)};
      const point = parseCoordinates(query); if (point) return {kind:'coordinates',...point};
      if (key === 'll' || key === 'center') return invalid();
      return parseMapsInput(query);
    }
    const camera = path.match(/@([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)/);
    if (camera) { const point = parseCoordinates(`${camera[1]},${camera[2]}`); return point ? {kind:'coordinates',...point} : invalid(); }
    const address = path.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1];
    return address && !address.startsWith('data=') ? parseMapsInput(address.replace(/\+/g,' ')) : invalid('El enlace no contiene un punto o dirección. Copia las coordenadas del lugar en Google Maps.');
  }
  if (/^[\d\s+().,;°'"′″’”ºNSEWO−-]+$/i.test(text) && /[,;°º]|\d\s*[NS]\s*\d|\d\s+-?\d/i.test(text)) return invalid();
  return {kind:'address',address:text};
}

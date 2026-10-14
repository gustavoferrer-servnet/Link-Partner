import { useMemo } from 'react';
import { NetworkMap } from './NetworkMap';
import './ConsultationLocationMap.css';

// This map accepts only the saved location, never supplier coverage or network data.
export function ConsultationLocationMap({ address, latitude, longitude }: { address: string; latitude?: number; longitude?: number }) {
  const location = useMemo(() => typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { lat: latitude, lng: longitude, label: address } : null, [address, latitude, longitude]);
  if (!location) return null;
  return <section className="consultation-location-map" aria-label="Ubicación consultada">
    <h2>Ubicación consultada</h2>
    <NetworkMap compact locationPin ariaLabel="Mapa de la dirección consultada" focusLocation={location} />
    <p>{address}</p>
    <small>{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</small>
  </section>;
}

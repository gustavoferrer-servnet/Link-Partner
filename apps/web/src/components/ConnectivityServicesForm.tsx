import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddressMapPicker } from './AddressMapPicker';

export type ConnectivityProduct = 'Internet dedicado' | 'L2L';
interface LocationCandidate { address: string; city: string; latitude: number; longitude: number; precision: 'address' | 'street-or-area'; token: string }
export interface LocationEntry { id: string; address: string; selected: LocationCandidate | null }
export interface ServiceEntry { id: string; capacity: string; locations: LocationEntry[] }
export const newService = (product: ConnectivityProduct): ServiceEntry => ({ id: crypto.randomUUID(), capacity: '100', locations: Array.from({ length: product === 'L2L' ? 2 : 1 }, () => ({ id: crypto.randomUUID(), address: '', selected: null })) });

export function ConnectivityServicesForm({ product, onProduct, services, onChange, disabled }: {
  product: ConnectivityProduct; onProduct: (product: ConnectivityProduct) => void;
  services: ServiceEntry[]; onChange: (update: (current: ServiceEntry[]) => ServiceEntry[]) => void; disabled: boolean;
}) {
  const count = services.reduce((total, service) => total + service.locations.length, 0);
  function updateLocation(serviceId: string, locationId: string, address: string, selected: LocationCandidate | null = null) {
    onChange(current => current.map(service => service.id === serviceId ? { ...service, locations: service.locations.map(location => location.id === locationId ? { ...location, address, selected } : location) } : service));
  }
  return <>
    <div className="cx-service-tabs" role="tablist" aria-label="Servicio de conectividad">{(['Internet dedicado', 'L2L'] as const).map((value, index) => <button key={value} id={`cx-service-tab-${index}`} type="button" role="tab" aria-selected={product === value} aria-controls="cx-service-panel" tabIndex={product === value ? 0 : -1} disabled={disabled} onClick={() => onProduct(value)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
      onProduct(target === 0 ? 'Internet dedicado' : 'L2L');
      document.getElementById(`cx-service-tab-${target}`)?.focus();
    }}>{value === 'L2L' ? 'Lan to Lan' : value}</button>)}</div>
    <div id="cx-service-panel" role="tabpanel" aria-labelledby={`cx-service-tab-${product === 'L2L' ? 1 : 0}`}>
      <fieldset className="cx-locations" disabled={disabled}><legend>Localidades a consultar</legend><p>Agrega de 1 a 10 direcciones. Captura la capacidad de cada servicio, de 50 a 1000 Mbps.</p>
        {services.map((service, index) => <div key={service.id} className="cx-location-entry cx-service-entry">
          <div className="cx-location-heading"><strong>Servicio {index + 1}</strong>{services.length > 1 ? <button type="button" className="cx-location-remove" aria-label={`Quitar servicio ${index + 1}`} onClick={() => onChange(current => current.filter(item => item.id !== service.id))}><Trash2 size={16} />Quitar</button> : null}</div>
          {service.locations.map((location, endpoint) => <div key={location.id} className="cx-service-address"><AddressAutocomplete visibleLabel name={`address-${location.id}`} label={product === 'L2L' ? `Dirección punta ${endpoint === 0 ? 'A' : 'B'} · servicio ${index + 1}` : `Dirección de instalación ${index + 1}`} value={location.address} city={location.selected?.city} required placeholder="Dirección, coordenadas o enlace de Google Maps" onChange={value => updateLocation(service.id, location.id, value)} onSelect={candidate => updateLocation(service.id, location.id, candidate.address, candidate)} /><AddressMapPicker label={product === 'L2L' ? `Dirección punta ${endpoint === 0 ? 'A' : 'B'} · servicio ${index + 1}` : `Dirección de instalación ${index + 1}`} selected={location.selected} disabled={disabled} onSelect={candidate => updateLocation(service.id, location.id, candidate.address, candidate)} />{location.selected ? <span className="cx-confirmed-address"><CheckCircle2 size={14} aria-hidden="true" />{location.selected.address}</span> : null}</div>)}
          <label>Capacidad del servicio {index + 1} (Mbps)<input type="number" inputMode="numeric" name={`capacity-${service.id}`} value={service.capacity} required min={50} max={1000} step={1} onChange={event => onChange(current => current.map(item => item.id === service.id ? { ...item, capacity: event.target.value } : item))} /><small>Entre 50 y 1000 Mbps{product === 'L2L' ? ' para el enlace entre las puntas A y B' : ''}.</small></label>
        </div>)}
        <div className="cx-add-location"><button type="button" className="cx-secondary" disabled={count + (product === 'L2L' ? 2 : 1) > 10} onClick={() => onChange(current => current.length * (product === 'L2L' ? 2 : 1) < 10 ? [...current, newService(product)] : current)}><Plus size={16} />{product === 'L2L' ? 'Agregar otro enlace L2L' : 'Agregar otra dirección'}</button><small aria-live="polite">{count} de 10 direcciones</small></div>
      </fieldset>
    </div>
  </>;
}

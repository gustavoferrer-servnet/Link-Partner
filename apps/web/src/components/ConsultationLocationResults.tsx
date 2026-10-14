import './ConsultationLocationResults.css';
import { useState } from 'react';
import type { DigitalConsultation } from '../types';
import { coverageStatuses } from '../lib/consultations';
import { ConsultationLocationMap } from './ConsultationLocationMap';
import { CoverageSupplierMaps } from './CoverageMapVersions';
import { CoverageTechnologies, CoverageTechnologyNote } from './CoverageTechnologies';

export function ConsultationLocationResults({ consultation }: { consultation: Pick<DigitalConsultation, 'input' | 'coverage' | 'locations' | 'services'> }) {
  const [selected, setSelected] = useState(0);
  const locations = consultation.locations ?? [consultation];
  const location = locations[selected] ?? locations[0];
  const selectedService = consultation.services?.find(service => service.locationIndexes.includes(selected));
  const serviceIndex = selectedService ? consultation.services!.indexOf(selectedService) : 0;
  const label = (index: number) => {
    const service = consultation.services?.find(service => service.locationIndexes.includes(index));
    if (!service) return `Dirección ${index + 1}`;
    return `Servicio ${consultation.services!.indexOf(service) + 1}${service.product === 'L2L' ? ` · Punta ${service.locationIndexes.indexOf(index) === 0 ? 'A' : 'B'}` : ''} · ${service.capacityMbps} Mbps`;
  };
  return <div className="consultation-location-results">
    {locations.length > 1 ? <><h2>Resultados por localidad</h2><p>{consultation.coverage.reason}</p><nav className="cx-location-results-nav" aria-label="Seleccionar localidad">{locations.map((item, index) => <button type="button" key={index} aria-pressed={selected === index} onClick={() => setSelected(index)}><strong>{label(index)}</strong><span>{item.input.address}</span><small>{coverageStatuses[item.coverage.status] || 'Por validar'}</small></button>)}</nav><h3>{label(selected)}: {location.input.address}</h3></> : selectedService ? <h3>{label(0)}</h3> : null}
    {selectedService?.product === 'L2L' ? <div className="cx-link-result"><strong>Servicio {serviceIndex + 1} · Lan to Lan · {selectedService.capacityMbps} Mbps</strong><p>{selectedService.coverage.reason}</p></div> : null}
    <ConsultationLocationMap key={`${location.input.latitude}:${location.input.longitude}`} address={location.input.address} latitude={location.input.latitude} longitude={location.input.longitude} />
    <p>{location.coverage.reason}</p><h2>Prefactibilidad por tecnología</h2>
    <CoverageTechnologies results={location.coverage.technologies} /><CoverageTechnologyNote />
    {location.coverage.suppliers?.length ? <div className="cx-supplier-results"><h2>Cobertura por proveedor</h2>{location.coverage.suppliers.map(supplier => <div className={`cx-supplier-row cx-supplier-row--${supplier.classification}`} key={supplier.supplierName}><strong>{supplier.supplierName}</strong><span>{supplier.policyLevel}</span><CoverageTechnologies compact results={supplier.technologies} /><CoverageSupplierMaps supplier={supplier} versions={location.coverage.versions} /></div>)}</div> : null}
  </div>;
}

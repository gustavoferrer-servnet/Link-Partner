import type { CustomerConsultation } from '../lib/customerAccount';
import './CustomerCoverageSummary.css';
const statusLabel = (status: string) => status === 'AVAILABLE' ? 'Prefactible' : status === 'NO_COVERAGE' ? 'Sin cobertura identificada' : 'Por validar';
function CoverageSummary({ coverage }: { coverage: CustomerConsultation['coverage'] }) {
  return <div className="cx-anonymous-summary"><p><strong>{coverage.routeCount} {coverage.routeCount === 1 ? 'ruta prefactible' : 'rutas prefactibles'}</strong></p>
    <dl>{coverage.technologies?.map((value, index) => <div key={`${value.technology}:${index}`}>
      <dt>{value.technology === 'MW' ? 'Microonda (MW)' : 'Fibra óptica (FO)'}</dt><dd>{statusLabel(value.status)}</dd>
      <dd>PoP más cercano: {value.nearestPopDistanceMeters === null || value.nearestPopDistanceMeters === undefined ? 'distancia por confirmar' : `${value.nearestPopDistanceMeters.toLocaleString('es-MX')} m en línea recta`}</dd>
    </div>)}</dl></div>;
}
export function CustomerCoverageSummary({ consultation }: { consultation: Pick<CustomerConsultation, 'input' | 'coverage' | 'locations' | 'services'> }) {
  const locations = consultation.locations ?? [consultation];
  return <div className="cx-coverage-summary"><h2>Resumen de prefactibilidad</h2>
    {consultation.services?.length ? consultation.services.map((service, index) => <section key={index}>
      <h3>Servicio {index + 1} · {service.product === 'L2L' ? 'Lan to Lan (L2L)' : service.product} · {service.capacityMbps} Mbps</h3>
      {service.product === 'L2L' ? <><p>{service.coverage.routeCount} rutas prefactibles en ambas puntas. El transporte entre A y B requiere validación.</p>{service.locationIndexes.map((locationIndex, endpoint) => <div key={locationIndex}><h4>Punta {endpoint === 0 ? 'A' : 'B'} · {locations[locationIndex].input.address}</h4><CoverageSummary coverage={locations[locationIndex].coverage} /></div>)}</> : <><p>{locations[service.locationIndexes[0]].input.address}</p><CoverageSummary coverage={service.coverage} /></>}
    </section>) : locations.map((location, index) => <section key={index}>{locations.length > 1 ? <h3>Dirección {index + 1} · {location.input.address}</h3> : null}<CoverageSummary coverage={location.coverage} /></section>)}
    <small>Rutas preliminares sujetas a validación de capacidad y disponibilidad. La distancia al PoP es informativa; no representa el recorrido de instalación.</small>
  </div>;
}

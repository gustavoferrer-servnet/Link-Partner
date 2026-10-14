import type { CoverageMapVersion } from '../types';
import './CoverageTechnologies.css';

const date = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function CoverageSupplierMaps({ supplier, versions }: { supplier: { supplierName: string; supplierId?: string }; versions?: CoverageMapVersion[] }) {
  const maps = versions?.filter(map => supplier.supplierId && map.supplierId ? supplier.supplierId === map.supplierId : supplier.supplierName === map.supplierName) ?? [];
  return <footer className="coverage-supplier-maps" aria-label={`Mapas utilizados por ${supplier.supplierName}`}>
    {maps.length ? <><strong>{maps.length === 1 ? 'Mapa utilizado para el cálculo' : 'Mapas utilizados para el cálculo'}</strong><ul>{maps.map(map => <li key={map.revisionId || `${map.id}:${map.updatedAt}`} title={map.sha256 ? `Revisión: ${map.revisionId || 'Anterior'}\nSHA-256: ${map.sha256}` : undefined}><span>{map.sourceFileName || 'Mapa registrado'}</span><small>{map.version ? `Versión ${map.version}` : 'Registro anterior'} · {date(map.updatedAt)}</small></li>)}</ul></> : <span>Mapa no identificado en esta consulta guardada.</span>}
  </footer>;
}

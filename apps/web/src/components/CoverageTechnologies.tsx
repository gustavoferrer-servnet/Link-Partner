import './CoverageTechnologies.css';

export interface TechnologyCoverage {
  technology: 'MW' | 'FO'; status: 'AVAILABLE' | 'PENDING' | 'NO_COVERAGE';
  classification: 'on-net' | 'near-net' | 'off-net' | null;
  distanceMeters: number | null; policyLevel: string; reason: string; supplierNames?: string[];
  insideCoverage?: boolean | null;
  nearestPop?: CoveragePoP | null;
  nearbyPops?: CoveragePoP[];
  nearbyPopRadiusMeters?: number;
}
export interface CoveragePoP {
  name: string | null; reference: string | null; kind: 'POP' | 'NETWORK_REFERENCE';
  supplierName: string; technology: 'MW' | 'FO' | null;
  distanceMeters: number; insideCoverage: boolean; sourceFileName: string;
}
export function coverageDistance(distance: number) {
  return distance >= 1000 ? `${(distance / 1000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} km` : `${Math.round(distance)} m`;
}
function popLabel(pop: CoveragePoP) { return pop.name || pop.reference || 'Sin nombre registrado'; }

function MicrowavePoPs({ result, compact }: { result: TechnologyCoverage; compact: boolean }) {
  const pop = result.nearestPop;
  return <div className="coverage-pops">
    {pop ? <><strong>{pop.kind === 'POP' ? 'PoP más cercano' : 'Punto de red más cercano'}: {popLabel(pop)}</strong><span>{coverageDistance(pop.distanceMeters)} en línea recta · {pop.supplierName}</span>{pop.technology === 'FO' ? <small>PoP FO de referencia; capacidad MW por validar.</small> : null}{!pop.insideCoverage ? <small>El punto de red está fuera de la mancha MW cargada.</small> : null}</> : <span>Sin PoPs o puntos de red identificados en los archivos de este proveedor.</span>}
    {result.nearbyPops?.length ? <details open={!compact}><summary>Otros PoPs o puntos de red en cobertura MW ({result.nearbyPops.length})</summary><small>Hasta {coverageDistance(result.nearbyPopRadiusMeters ?? 25000)}, ordenados por distancia.</small><ul>{result.nearbyPops.map((point, index) => <li key={`${point.supplierName}:${point.reference}:${index}`}><strong>{popLabel(point)}</strong><span>{coverageDistance(point.distanceMeters)} · {point.supplierName}{point.technology === 'FO' ? ' · PoP FO' : ''}</span></li>)}</ul></details> : null}
  </div>;
}
export function technologyLabel(result?: TechnologyCoverage) {
  return result?.status === 'AVAILABLE' ? 'Prefactible' : result?.status === 'NO_COVERAGE' ? 'Sin cobertura identificada' : result?.classification === 'near-net' ? 'Requiere revisión' : 'Por validar';
}
export function CoverageTechnologies({ results, compact = false }: { results?: TechnologyCoverage[]; compact?: boolean }) {
  return <div className={compact ? 'coverage-technologies coverage-technologies--compact' : 'coverage-technologies'} aria-label="Prefactibilidad por tecnología">{(['MW','FO'] as const).map(technology => {
    const result = results?.find(item => item.technology === technology);
    return <div key={technology} className={`coverage-technology coverage-technology--${result?.status ?? 'PENDING'}`}><strong>{technology === 'MW' ? 'Microonda (MW)' : 'Fibra óptica (FO)'}</strong><span>{technologyLabel(result)}</span>{!compact && result?.supplierNames?.length ? <ul className="coverage-technology-carriers" aria-label={`Carriers ${technology}`}>{result.supplierNames.map(name => <li key={name}>{name}</li>)}</ul> : null}{result?.distanceMeters !== null && result?.distanceMeters !== undefined ? <small>{technology === 'MW' ? result.insideCoverage ? 'Dentro de la mancha de cobertura MW' : `${coverageDistance(result.distanceMeters)} a la mancha de cobertura MW` : `${result.policyLevel}${result.insideCoverage === false ? ` · ${coverageDistance(result.distanceMeters)} al área FO (informativo)` : ''}`}</small> : null}{technology === 'MW' && result?.insideCoverage !== undefined && (result.nearestPop || result.insideCoverage !== null) ? <MicrowavePoPs result={result} compact={compact} /> : null}{!compact ? <p>{result?.reason || 'Esta consulta no cuenta con un resultado guardado por tecnología. Se requiere validación técnica.'}</p> : null}</div>;
  })}</div>;
}
export function CoverageTechnologyNote() {
  return <p className="coverage-technology-note">Las coberturas sin tecnología especificada se consideran fibra óptica (FO). FO se clasifica por las áreas OnNet y NearNet del mapa, sin umbrales de distancia. MW requiere estar dentro de su mancha. La validación técnica confirma capacidad, ruta, línea de vista y permisos.</p>;
}

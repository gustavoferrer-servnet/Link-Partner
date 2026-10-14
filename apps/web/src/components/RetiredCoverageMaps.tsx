import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import type { CoverageMapVersion } from '../types';

export interface RetiredMap { id: string; sourceFileName: string; activityId: string; retiredAt: string; mapVersion?: CoverageMapVersion }
export function RetiredCoverageMaps({ supplierId, canManage, disabled, onRestore }: { supplierId: string; canManage: boolean; disabled: boolean; onRestore: (map: RetiredMap) => void }) {
  const { token } = useSession();
  const [open, setOpen] = useState(false);
  const records = useQuery({ queryKey: ['retired-coverages', supplierId, token], queryFn: ({ signal }) => apiGet<RetiredMap[]>(`/suppliers/${encodeURIComponent(supplierId)}/retired-coverages`, token, signal), enabled: open });
  return <details className="coverage-activity-log" onToggle={event => setOpen(event.currentTarget.open)}><summary>Archivos eliminados · restaurar cobertura</summary>{open ? records.isPending ? <p role="status">Cargando archivos eliminados…</p> : records.isError ? <p role="alert">No pudimos cargar los archivos eliminados. <button type="button" onClick={() => { void records.refetch(); }}>Reintentar</button></p> : records.data?.length ? <ul className="coverage-retired-files">{records.data.map(map => <li key={map.activityId}><strong>{map.sourceFileName}</strong><small>Versión {map.mapVersion?.version ?? 1} · eliminado {new Date(map.retiredAt).toLocaleString('es-MX')}</small>{canManage ? <button type="button" className="button" disabled={disabled} onClick={() => onRestore(map)}>Restaurar {map.sourceFileName}</button> : null}</li>)}</ul> : <p>No hay archivos eliminados para este proveedor.</p> : null}</details>;
}

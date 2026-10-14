import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import type { CoverageActivity } from '../types';

interface ActivityPage { items: CoverageActivity[]; nextCursor: string | null }
const date = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function CoverageActivityLog({ supplierId }: { supplierId: string }) {
  const { token } = useSession();
  const [open, setOpen] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ['coverage-activity', supplierId, token], initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => apiGet<ActivityPage>(`/suppliers/${encodeURIComponent(supplierId)}/coverage-activity${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`, token, signal),
    getNextPageParam: page => page.nextCursor, enabled: open,
  });
  const events = history.data?.pages.flatMap(page => page.items) ?? [];
  return <details className="coverage-activity-log" onToggle={event => setOpen(event.currentTarget.open)}><summary>Historial de actualización de mapas</summary>
    {history.isPending ? <p role="status">Cargando actividad…</p> : history.isError ? <p role="alert">No fue posible cargar el historial. <button type="button" onClick={() => void history.refetch()}>Reintentar</button></p> : events.length ? <ol>{events.map(event => <li key={event.id}><strong>{event.map.sourceFileName} · Versión {event.map.version}</strong><span>{event.action === 'CREATED' ? 'Carga inicial' : event.action === 'DELETED' ? 'Archivo eliminado de la cobertura activa' : event.action === 'RESTORED' ? `Restauración desde versión ${event.previousMap?.version}` : `Actualización desde versión ${event.previousMap?.version}`} · {date(event.occurredAt)}</span><span>{event.actor.displayName} · {event.actor.email}</span><small>{event.featureCount} elementos · {event.polygonCount} polígonos · Huella {event.map.sha256?.slice(0,12)}</small></li>)}</ol> : <p>Aún no hay cargas registradas en el historial. Los mapas existentes conservan su fecha y versión base.</p>}
    {history.hasNextPage ? <button className="button" type="button" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? 'Cargando…' : 'Ver actividad anterior'}</button> : null}
  </details>;
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { config } from '../config';
import { supplierState } from '../lib/supplierManagement';
import type { Supplier } from '../types';

export function SupplierOperationalBadge({ name }: { name: string }) {
  const { token } = useSession();
  const query = useQuery({ queryKey: ['suppliers', token], queryFn: ({ signal }) => apiGet<Supplier[]>('/supplier-management', token, signal), enabled: config.dataMode === 'api', refetchInterval: 60000 });
  const matches = query.data?.filter(s => s.name.trim().toLocaleLowerCase('es-MX') === name.trim().toLocaleLowerCase('es-MX')) ?? [];
  if (config.dataMode !== 'api') return <small>Evaluación operativa disponible al conectar la API</small>;
  if (query.isPending) return <small>Consultando evaluación…</small>;
  if (query.isError) return <small>No se pudo consultar la evaluación operativa</small>;
  if (matches.length !== 1) return <small>Sin evaluación vinculada</small>;
  const supplier = matches[0];
  return <small><Link to={`/suppliers?provider=${encodeURIComponent(supplier.id)}`}>{supplierState(supplier)} · {supplier.evaluation?.score == null ? 'Sin calificación' : `${supplier.evaluation.score}/100`} · evidencia {supplier.evaluation?.confidence ?? 'Sin historial'}</Link></small>;
}

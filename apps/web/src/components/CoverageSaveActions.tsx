import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiSend } from '../api/client';
import { useSession } from '../auth/SessionContext';
import type { MapLocation } from '../lib/coverageFiles';
import type { Opportunity } from '../types';

export function CoverageSaveActions({ location, selection, ready }: { location: MapLocation; selection: { id: string; revisionId: string; featureIndexes: number[] }[]; ready: boolean }) {
  const { token, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [requestId] = useState(() => crypto.randomUUID());
  const [siteName, setSiteName] = useState(location.label.slice(0, 180));
  const [capacity, setCapacity] = useState(100);
  const save = useMutation({
    mutationFn: () => apiSend<Opportunity>('/coverage/consultations', token, 'POST', {
      requestId, address: location.label, latitude: location.lat, longitude: location.lng,
      siteName, capacityMbps: capacity, coverageSelection: selection,
    }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['opportunities'] }); void queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
  const proposal = useMutation({ mutationFn: (opportunity: Opportunity) => apiSend<Opportunity>(`/opportunities/${encodeURIComponent(opportunity.id)}/proposals`, token, 'POST', {}),
    onSuccess: opportunity => { void queryClient.invalidateQueries({ queryKey: ['opportunities'] }); queryClient.setQueryData(['opportunity', opportunity.id, token], opportunity); },
  });
  const busy = save.isPending || proposal.isPending;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const openProposal = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'proposal';
    try {
      const opportunity = save.data ?? await save.mutateAsync();
      if (openProposal) { await proposal.mutateAsync(opportunity); navigate(`/opportunities/${encodeURIComponent(opportunity.id)}`); }
    } catch { /* The API error is displayed below; retries reuse the same reservation. */ }
  }
  return <form className="coverage-save" onSubmit={submit}>
    <h3>Guardar consulta y preparar propuesta</h3>
    <p>La consulta se registrará a nombre de {user.displayName} y quedará disponible en Oportunidades.</p>
    <div className="coverage-save__fields">
      <label>Nombre del sitio<input className="control" required minLength={2} maxLength={180} value={siteName} disabled={busy || !!save.data} onChange={event => setSiteName(event.target.value)} /></label>
      <label>Capacidad (Mbps)<input className="control" type="number" required min={1} max={100000} step={1} value={capacity} disabled={busy || !!save.data} onChange={event => setCapacity(Number(event.target.value))} /></label>
    </div>
    <small>Internet dedicado · Precio, SLA y fecha por confirmar.</small>
    <div className="coverage-save__buttons">
      <button className="button" type="submit" value="save" disabled={!ready || busy || !!save.data}>{save.isPending ? 'Guardando…' : save.data ? 'Consulta guardada' : 'Guardar consulta'}</button>
      <button className="button button--primary" type="submit" value="proposal" disabled={!ready || busy}>{proposal.isPending ? 'Generando propuesta…' : 'Generar nueva propuesta'}</button>
    </div>
    {save.isError ? <p role="alert">{save.error.message}</p> : null}
    {proposal.isError ? <p role="alert">{proposal.error.message}</p> : null}
    {save.data ? <p role="status">Consulta guardada con código <strong>{save.data.consultationCode}</strong>. <Link to={`/opportunities/${save.data.id}`}>Ver oportunidad</Link></p> : null}
  </form>;
}

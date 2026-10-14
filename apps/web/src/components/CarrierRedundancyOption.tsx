import { useState } from 'react';
import { customerRequest, type CustomerConsultation } from '../lib/customerAccount';

export function CarrierRedundancyOption({ consultation, csrfToken, recoveryKey, onUpdated }: {
  consultation: CustomerConsultation; csrfToken?: string; recoveryKey?: string; onUpdated: (value: CustomerConsultation) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const options = consultation.proposalOptions;
  if (!options?.carrierRedundancyAvailable) return null;
  async function change(requested: boolean) {
    setBusy(true); setError(''); setSaved(false);
    try {
      const updated = await customerRequest<CustomerConsultation>(`/consultations/${encodeURIComponent(consultation.code)}/proposal-options`, {
        method: 'PATCH', ...(recoveryKey ? { headers: { 'X-Consultation-Key': recoveryKey } } : {}),
        body: JSON.stringify({ carrierRedundancy: requested, ...(consultation.input.email ? { email: consultation.input.email } : {}) }),
      }, csrfToken);
      onUpdated(updated); setSaved(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'No pudimos guardar tu preferencia.'); }
    finally { setBusy(false); }
  }
  return <div className="cx-carrier-redundancy">
    <label><input type="checkbox" checked={options.carrierRedundancyRequested} disabled={busy} onChange={event => { void change(event.target.checked); }} />
      <strong>Solicitar propuestas con redundancia de rutas</strong>
    </label>
    {options.redundancyLocations ? <p>Disponible en {options.redundancyLocations.length} {options.redundancyLocations.length === 1 ? 'localidad' : 'localidades'}: {options.redundancyLocations.join('; ')}.</p> : <p>Encontramos {options.routeCount} rutas prefactibles.</p>}
    <small>Solicita alternativas de conectividad. La independencia de las rutas y la disponibilidad se confirmarán en la propuesta.</small>
    {busy ? <p role="status">Guardando preferencia…</p> : saved ? <p role="status">Preferencia guardada en tu consulta y oportunidad.</p> : options.carrierRedundancyRequested ? <p>Esta opción quedó marcada para preparar tus propuestas.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}

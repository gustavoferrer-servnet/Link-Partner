import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, History, RefreshCw } from 'lucide-react';
import { CustomerCoverageSummary } from './CustomerCoverageSummary';
import { customerRequest, type CustomerConsultation, type CustomerSession } from '../lib/customerAccount';

const passwordPattern = String.raw`(?=.*\p{Lu})(?=.*\p{Ll})(?=.*[^\p{L}\p{N}\s]).{8,128}`;
const passwordHelp = 'Mínimo 8 caracteres, con una mayúscula, una minúscula y un carácter especial (por ejemplo: !, @ o #).';

export function CustomerAccountForm({ mode, onMode, onAuthenticate }: { mode: 'login' | 'register'; onMode: (mode: 'login' | 'register') => void; onAuthenticate: (mode: 'login' | 'register', values: Record<string, string>) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    if (mode === 'register' && data.get('password') !== data.get('confirmation')) { setError('Las contraseñas deben coincidir.'); return; }
    setBusy(true);
    const values: Record<string, string> = { email: String(data.get('email')), password: String(data.get('password')) };
    if (mode === 'register') { values.fullName = String(data.get('fullName')); values.company = String(data.get('company')); }
    try { await onAuthenticate(mode, values); }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos iniciar sesión.'); }
    finally { setBusy(false); }
  }
  return <section className="cx-panel cx-retrieve"><History size={28} /><h1>{mode === 'register' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h1><p>Conserva tus consultas y revisa su seguimiento desde un solo lugar.</p>
    <div className="cx-result-nav"><button disabled={busy} aria-pressed={mode === 'login'} onClick={() => { onMode('login'); setError(''); }}>Iniciar sesión</button><button disabled={busy} aria-pressed={mode === 'register'} onClick={() => { onMode('register'); setError(''); }}>Crear cuenta</button></div>
    <form key={mode} className="cx-form" onSubmit={submit}>
      {mode === 'register' ? <><label>Nombre completo<input name="fullName" required maxLength={200} autoComplete="name" placeholder="Nombre(s) y apellidos" /></label><label>Empresa<input name="company" required maxLength={200} autoComplete="organization" /></label></> : null}
      <label>Email<input name="email" required type="email" maxLength={254} autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} /></label>
      <label>Contraseña<input name="password" type="password" required minLength={mode === 'register' ? 8 : 1} maxLength={128} pattern={mode === 'register' ? passwordPattern : undefined} title={mode === 'register' ? passwordHelp : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />{mode === 'register' ? <small>{passwordHelp}</small> : null}</label>
      {mode === 'register' ? <label>Confirmar contraseña<input name="confirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label> : null}
      {error ? <div role="alert" className="cx-error">{error}</div> : null}
      <button className="cx-primary" disabled={busy}>{busy ? 'Un momento…' : mode === 'register' ? 'Crear mi cuenta' : 'Iniciar sesión'}<ArrowRight size={17} /></button>
    </form><p>Las nuevas consultas se guardarán en tu cuenta. Puedes agregar consultas anteriores con su código y el email de esta cuenta.</p>
  </section>;
}
export function CustomerHistory({ session, onOpen, onNew }: { session: CustomerSession; onOpen: (consultation: CustomerConsultation, tracking: boolean) => void; onNew: () => void }) {
  const [items, setItems] = useState<CustomerConsultation[]>([]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setBusy(true);
      try { const items = await customerRequest<CustomerConsultation[]>('/customers/consultations', { signal: controller.signal }); if (!controller.signal.aborted) { setItems(items); setError(''); } }
      catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No pudimos cargar tu historial.'); }
      finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void load(); const interval = window.setInterval(() => { void load(); }, 30000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [session.customer.id, revision]);
  async function importConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice('');
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') || '').trim().toUpperCase();
    setBusy(true);
    try { await customerRequest(`/customers/consultations/${encodeURIComponent(code)}`, { method: 'POST', body: '{}' }, session.csrfToken); setNotice(`Consulta ${code} agregada a tu historial.`); form.reset(); setRevision(value => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos agregar la consulta.'); }
    finally { setBusy(false); }
  }
  const query = filter.trim().toLocaleLowerCase('es');
  const visible = items.filter(item => [item.code, item.input.address, item.input.company, item.input.customerReference, ...(item.locations?.map(location => location.input.address) ?? [])].some(value => value?.toLocaleLowerCase('es').includes(query)));
  return <section className="cx-history"><header className="cx-history-heading"><div><h1>Mis consultas</h1><p>{session.customer.fullName} · {session.customer.company}</p></div><button className="cx-primary" onClick={onNew}>Nueva consulta<ArrowRight size={17} /></button></header>
    <div className="cx-history-tools"><label>Buscar en mi historial<input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Código, dirección, empresa o referencia" /></label><button className="cx-secondary" disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />{busy ? 'Actualizando…' : 'Actualizar'}</button></div>
    {error ? <div className="cx-error" role="alert">{error}</div> : null}{notice ? <p className="cx-account-notice" role="status">{notice}</p> : null}
    <p aria-live="polite">{items.length} {items.length === 1 ? 'consulta guardada' : 'consultas guardadas'} · El seguimiento se actualiza cada 30 segundos.</p>
    {!busy && !visible.length ? <section className="cx-panel"><h2>{items.length ? 'Sin coincidencias' : 'Tu historial comienza aquí'}</h2><p>{items.length ? 'Prueba con otro código o dirección.' : 'Inicia una consulta o agrega una que ya tengas con su código.'}</p></section> : null}
    <div className="cx-history-list">{visible.map(item => <article key={item.code} className="cx-panel"><div className="cx-history-card-heading"><strong>{item.code}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('es-MX')}</time></div><h2>{item.services ? `${item.services.length} ${item.services.length === 1 ? 'servicio' : 'servicios'} · ${item.input.product}` : item.locations ? `${item.locations.length} localidades` : item.input.address}</h2>{item.locations ? <p>{item.coverage.reason}</p> : null}<p>{item.input.product} · {item.services && item.services.length > 1 ? `${item.services.map(service => service.capacityMbps).join(' · ')} Mbps por servicio` : `${item.input.capacityMbps} Mbps`} · {item.channel === 'WHOLESALE' ? 'Wholesale' : 'Enterprise'}</p>{item.input.customerReference ? <p>Referencia: {item.input.customerReference}</p> : null}<p><strong>{item.coverage.status === 'AVAILABLE' ? 'Prefactible' : item.coverage.status === 'NO_COVERAGE' ? 'Revisión de alternativas' : 'Por validar'}</strong></p>{item.locations ? <p>Revisa MW y FO de cada dirección en «Ver consulta».</p> : <CustomerCoverageSummary consultation={item} />}<p>{item.tracking.stage} · {item.tracking.state}</p><p>Fecha compromiso: {item.tracking.commitmentDate || 'Por confirmar'}</p><div className="cx-result-nav"><button onClick={() => onOpen(item, false)}>Ver consulta</button><button onClick={() => onOpen(item, true)}>Seguimiento</button></div></article>)}</div>
    <section className="cx-panel"><h2>Agrega una consulta anterior</h2><p>Ingresa el código de una consulta registrada con <strong>{session.customer.email}</strong>.</p><form className="cx-history-import cx-form" onSubmit={importConsultation}><label>Código de consulta<input name="code" required minLength={6} maxLength={8} pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}|[A-HJ-NP-Za-hj-np-z2-9]{8}" title="Código de 6 caracteres; también se aceptan códigos anteriores de 8." autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="6 caracteres" /></label><button className="cx-primary" disabled={busy}>Agregar a mi historial</button></form></section>
  </section>;
}

import { ConnectivityServicesForm, newService, type ConnectivityProduct, type ServiceEntry } from '../components/ConnectivityServicesForm';
import { CustomerCoverageSummary } from "../components/CustomerCoverageSummary";
import { CarrierRedundancyOption } from '../components/CarrierRedundancyOption';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2, FileCheck, HardHat, MapPin, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { CustomerAccountForm, CustomerHistory } from '../components/CustomerAccount';
import { customerRequest, useCustomerAccount, type CustomerConsultation as Consultation } from '../lib/customerAccount';
import './CustomerExperiencePage.css';
import { BrandWordmark } from '../components/BrandWordmark';
import { useAddressProvider } from '../lib/addressProvider';

const newDrafts = (): Record<ConnectivityProduct, ServiceEntry[]> => ({ 'Internet dedicado': [newService('Internet dedicado')], L2L: [newService('L2L')] });
export function CustomerExperiencePage() {
  const account = useCustomerAccount();
  const [accountMode, setAccountMode] = useState<'login' | 'register'>('login');
  const [ownedCode, setOwnedCode] = useState('');
  const provider = useAddressProvider();
  const [channel, setChannel] = useState<'ENTERPRISE' | 'WHOLESALE'>('ENTERPRISE');
  const [result, setResult] = useState<Consultation | null>(null);
  const [legacyRecoveryKey, setLegacyRecoveryKey] = useState('');
  const [view, setView] = useState<'search' | 'retrieve' | 'result' | 'tracking' | 'account' | 'history'>('search');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [product, setProduct] = useState<ConnectivityProduct>('Internet dedicado');
  const [drafts, setDrafts] = useState(newDrafts);
  const services = drafts[product];
  const allLocationsConfirmed = services.every(service => service.locations.every(location => location.selected !== null));
  const [mailStatus, setMailStatus] = useState('');
  const [mailBusy, setMailBusy] = useState(false);
  const [queryVersion, setQueryVersion] = useState(0);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  function startNewConsultation() {
    setView('search'); setResult(null); setOwnedCode(''); setLegacyRecoveryKey('');
    setProduct('Internet dedicado'); setDrafts(newDrafts()); setError(''); setMailStatus('');
    setQueryVersion(value => value + 1); attempt.current = null;
  }
  useEffect(() => {
    if (!account.session || !ownedCode || (view !== 'tracking' && view !== 'result')) return;
    const controller = new AbortController();
    const refresh = () => customerRequest<Consultation>(`/customers/consultations/${ownedCode}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult(current => current?.code === value.code && (current.proposalOptions?.updatedAt ?? '') > (value.proposalOptions?.updatedAt ?? '') ? current : value); }).catch(() => {});
    void refresh(); const interval = window.setInterval(() => { void refresh(); }, 30000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [account.session?.customer.id, ownedCode, view]);
  useEffect(() => {
    if (!account.loading && !account.session && (view === 'history' || ownedCode)) { setResult(null); setOwnedCode(''); setAccountMode('login'); setView('account'); }
  }, [account.loading, account.session, view, ownedCode]);
  async function logout() {
    setBusy(true);
    try { await account.logout(); setView('search'); setResult(null); setOwnedCode(''); setProduct('Internet dedicado'); setDrafts(newDrafts()); setError(''); attempt.current = null; }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos cerrar sesión.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allLocationsConfirmed) { setError('Selecciona una sugerencia para cada dirección antes de consultar cobertura.'); return; }
    setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const common = { fullName: String(form.get('fullName') || '').trim(), email: String(form.get('email') || '').trim().toLowerCase(), company: String(form.get('company') || '').trim(), channel, product, ...(channel === 'WHOLESALE' ? { customerReference: String(form.get('reference') || '') } : {}) };
    const requestedServices = services.map(service => ({ capacityMbps: Number(service.capacity), locations: service.locations.map(location => {
      const point = location.selected!; return { address: point.address, city: point.city, latitude: point.latitude, longitude: point.longitude, locationToken: point.token };
    }) }));
    const input = { ...common, services: requestedServices };
    const signature = JSON.stringify({ ...common, services: requestedServices.map(service => ({ ...service, locations: service.locations.map(({ locationToken: _token, ...point }) => point) })) });
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    const access = attempt.current!.key;
    try {
      const consultation = await customerRequest<Consultation>('/prefeasibility', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': access }, body: JSON.stringify(input) }, account.session?.csrfToken);
      setOwnedCode(account.session ? consultation.code : '');
      setResult(consultation); setLegacyRecoveryKey(''); setMailStatus(''); setView('result');
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos consultar cobertura.'); }
    finally { setBusy(false); }
  }
  async function retrieve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget); const code = String(form.get('code')).trim().toUpperCase();
    const legacyKey = String(form.get('key') || '').trim();
    try {
      const consultation = await customerRequest<Consultation>(`/consultations/${encodeURIComponent(code)}${legacyKey ? '' : '/retrieve'}`, legacyKey ? { headers: { 'X-Consultation-Key': legacyKey } } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: String(form.get('email') || '').trim().toLowerCase() }) });
      setOwnedCode('');
      setResult(consultation); setLegacyRecoveryKey(legacyKey); setView('result'); setMailStatus('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos recuperar la consulta.'); }
    finally { setBusy(false); }
  }
  async function sendEmail() {
    if (!result || mailBusy) return;
    setMailBusy(true); setMailStatus('');
    try {
      await customerRequest(`/consultations/${encodeURIComponent(result.code)}/email`, { method: 'POST', body: JSON.stringify({ email: result.input.email }) }, account.session?.csrfToken);
      setMailStatus(`Consulta enviada a ${result.input.email}. Revisa también tu carpeta de spam.`);
    } catch (error) { setMailStatus(error instanceof Error ? error.message : 'No pudimos enviar la consulta. Intenta nuevamente.'); }
    finally { setMailBusy(false); }
  }
  return <div className="cx">
    <header className="cx-header"><Link to="/cx" onClick={startNewConsultation} className="cx-brand"><BrandWordmark cx /><small>Servnet Partner Network</small></Link><nav aria-label="Navegación CX"><button onClick={() => { setView('retrieve'); setError(''); }}>Recuperar consulta</button>{account.session ? <><button onClick={() => { setView('history'); setError(''); }}>Mis consultas</button><button disabled={busy} onClick={() => { void logout(); }}>Cerrar sesión</button></> : <><button disabled={account.loading} onClick={() => { setAccountMode('login'); setView('account'); setError(''); }}>Iniciar sesión</button><button disabled={account.loading} onClick={() => { setAccountMode('register'); setView('account'); setError(''); }}>Crear cuenta</button></>}<button type="button" className="cx-new-consultation" disabled={busy} onClick={startNewConsultation}><Plus size={16} aria-hidden="true" />Nueva consulta</button></nav></header>
    <main className="cx-main"><ol className="cx-steps" aria-label="Recorrido"><li className={view === 'search' ? 'active' : ''}>01 · Explorar</li><li className={view === 'result' ? 'active' : ''}>02 · Mi consulta</li><li className={view === 'tracking' ? 'active' : ''}>03 · Seguimiento</li></ol>
      {account.sessionError ? <div className="cx-error" role="alert">{account.sessionError} Recarga la página para volver a intentarlo.</div> : null}
      {error ? <div className="cx-error" role="alert">{error}</div> : null}
      {view === 'account' ? <CustomerAccountForm mode={accountMode} onMode={setAccountMode} onAuthenticate={async (mode, values) => { const session = await account.authenticate(mode, values); attempt.current = null; setOwnedCode('');
        if (result?.input.email?.trim().toLowerCase() === session.customer.email) {
          try { await customerRequest(`/customers/consultations/${encodeURIComponent(result.code)}`, { method: 'POST', body: '{}' }, session.csrfToken); }
          catch (error) { setError(error instanceof Error ? error.message : 'No pudimos agregar la consulta abierta. Puedes agregarla con su código en Mis consultas.'); }
        }
        setResult(null); setView('history'); }} /> : null}
      {view === 'history' && account.session ? <CustomerHistory session={account.session} onNew={startNewConsultation} onOpen={(consultation, tracking) => { setResult(consultation); setOwnedCode(consultation.code); setLegacyRecoveryKey(''); setMailStatus(''); setView(tracking ? 'tracking' : 'result'); setError(''); }} /> : null}
      {view === 'search' ? <div className="cx-layout"><section className="cx-intro"><MapPin size={34} /><h1>Tu próxima conexión comienza aquí.</h1><p>Consulta cobertura, recibe una propuesta y conserva tu consulta en un solo lugar.</p><div className="cx-profiles" aria-label="Perfil de consulta"><button aria-pressed={channel === 'ENTERPRISE'} onClick={() => setChannel('ENTERPRISE')}><strong>Enterprise</strong><span>Conectividad para mis sedes</span></button><button aria-pressed={channel === 'WHOLESALE'} onClick={() => setChannel('WHOLESALE')}><strong>Wholesale</strong><span>Conectividad para mis clientes</span></button></div><p className="cx-note"><ShieldCheck size={18} /> Puedes comenzar sin cuenta. La cobertura es preliminar; precio, SLA y fecha se confirman en la propuesta.</p></section>
      <form key={`${account.session?.customer.id ?? "guest"}:${queryVersion}`} className="cx-panel cx-form" onSubmit={submit}><h2>¿Dónde quieres conectar?</h2><ConnectivityServicesForm product={product} onProduct={value => { setProduct(value); setError(''); }} services={services} onChange={update => { setDrafts(current => ({ ...current, [product]: update(current[product]) })); setError(''); }} disabled={busy} />{channel === 'WHOLESALE' ? <label>Referencia de tu cliente<input name="reference" maxLength={100} placeholder="Referencia interna (opcional)" /></label> : null}<fieldset className="cx-contact"><legend>Datos de tu consulta</legend><p>{account.session ? "Esta consulta se guardará automáticamente en tu cuenta." : "Usa tu email junto con el código para recuperar esta consulta."}</p><label>Nombre completo<input name="fullName" defaultValue={account.session?.customer.fullName} required maxLength={200} autoComplete="name" placeholder="Nombre(s) y apellidos" /></label><label>Email<input name="email" defaultValue={account.session?.customer.email} readOnly={Boolean(account.session)} type="email" required maxLength={254} autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="nombre@empresa.com" /></label><label>Empresa<input name="company" defaultValue={account.session?.customer.company} required maxLength={200} autoComplete="organization" /></label></fieldset><div className="cx-location-validation"><p>Puedes pegar una dirección de Google Maps, coordenadas decimales o en grados/minutos/segundos, o un enlace de ubicación. Selecciona el punto encontrado.</p>

        <small className="cx-attribution">{!provider ? 'Cargando proveedor de búsqueda…' : <>Búsqueda de ubicación con {provider.provider === 'google' ? <span translate="no">Google Maps</span> : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>}. Confirma la dirección y el punto encontrado.</>}</small>
      </div>{allLocationsConfirmed ? <button type="submit" className="cx-primary" disabled={busy || account.loading || Boolean(account.sessionError)}>{busy ? 'Consultando…' : services.length > 1 ? `Consultar ${services.length} servicios` : 'Consultar cobertura'}<ArrowRight size={17} /></button> : null}<small>Sin compromiso de contratación.</small></form></div> : null}
      {view === 'retrieve' ? <section className="cx-panel cx-retrieve"><h1>Recupera tu consulta</h1><p>Ingresa tu código y el email registrado en tu consulta.</p><form className="cx-form" onSubmit={retrieve}><label>Código de consulta<input name="code" required minLength={6} maxLength={8} pattern="[A-HJ-NP-Za-hj-np-z2-9]{6}|[A-HJ-NP-Za-hj-np-z2-9]{8}" title="Código de 6 caracteres; también se aceptan códigos anteriores de 8." autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder="Código de 6 caracteres" /></label><label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Email registrado en tu consulta" /></label><button className="cx-primary" disabled={busy}>{busy ? 'Recuperando…' : 'Recuperar consulta'}</button></form><details className="cx-legacy-recovery"><summary>Recuperar una consulta anterior con llave privada</summary><form className="cx-form" onSubmit={retrieve}><label>Código de consulta<input name="code" required autoCapitalize="characters" maxLength={23} /></label><label>Llave privada<input name="key" required autoComplete="off" /></label><button className="cx-primary" disabled={busy}>Recuperar consulta anterior</button></form></details></section> : null}
      {result && (view === 'result' || view === 'tracking') ? <div className="cx-result"><header><p>{result.channel === 'ENTERPRISE' ? 'Tu consulta de conectividad' : 'Consulta para tu cliente'}</p><h1>{result.code}</h1><span>{result.services ? `${result.services.length} ${result.services.length === 1 ? 'servicio' : 'servicios'} · ${result.input.company}` : result.locations ? `${result.locations.length} localidades · ${result.input.company}` : result.input.address}</span>{result.input.fullName || result.input.firstName ? <p>{result.input.fullName || [result.input.firstName, result.input.lastName].filter(Boolean).join(' ')} · {result.input.company}{result.input.email ? <><br />{result.input.email}</> : null}</p> : null}</header><div className="cx-result-nav"><button aria-pressed={view === 'result'} onClick={() => setView('result')}>Mi consulta</button><button aria-pressed={view === 'tracking'} onClick={() => setView('tracking')}>Seguimiento</button></div>{view === 'result' ? <><section className="cx-panel"><div className="cx-result-grid"><div><small>Servicio</small><strong>{result.input.product === 'L2L' ? 'Lan to Lan (L2L)' : result.input.product}</strong></div><div><small>Capacidad</small><strong>{result.services && result.services.length > 1 ? 'Por servicio' : `${result.input.capacityMbps} Mbps`}</strong></div><div><small>Cobertura</small><strong>{result.coverage.status === 'AVAILABLE' ? 'Prefactible' : result.coverage.status === 'NO_COVERAGE' ? 'Revisión de alternativas' : 'Por validar'}</strong></div><div><small>Precio mensual</small><strong>Propuesta pendiente</strong></div></div><CustomerCoverageSummary key={`locations:${result.code}`} consultation={result} /><CarrierRedundancyOption key={`redundancy:${result.code}`} consultation={result} csrfToken={account.session?.csrfToken} recoveryKey={legacyRecoveryKey} onUpdated={value => setResult(current => current?.code === value.code ? { ...value, tracking: current.tracking } : current)} /><p>{result.pricing.reason}</p></section><section className="cx-panel cx-consultation-notes" aria-labelledby="cx-notes-title"><h2 id="cx-notes-title">Lo que debes saber antes de contratar</h2><div className="cx-conditions"><p><MapPin size={18} aria-hidden="true" /><strong>Cobertura</strong>Sujeta a validación técnica final.</p><p><HardHat size={18} aria-hidden="true" /><strong>Obra civil</strong>Podría requerir trabajos adicionales.</p><p><FileCheck size={18} aria-hidden="true" /><strong>Permisos</strong>Algunos edificios requieren autorización.</p><p><CalendarClock size={18} aria-hidden="true" /><strong>Fecha estimada</strong>Puede variar por condiciones de instalación.</p><p><Wallet size={18} aria-hidden="true" /><strong>Precio</strong>Puede cambiar por costos extraordinarios.</p><p><ShieldCheck size={18} aria-hidden="true" /><strong>SLA</strong>Se confirma según la solución contratada.</p></div></section><section className="cx-panel"><h2>Conserva tu consulta</h2>{account.session && ownedCode === result.code ? <p className="cx-account-notice">Esta consulta está guardada en tu cuenta. Encuéntrala en Mis consultas.</p> : null}<p>Guarda tu código <strong>{result.code}</strong>. {result.input.email ? 'Puedes recuperar esta consulta con el código y tu email.' : 'Conserva la llave privada de tu consulta anterior.'}</p><button type="button" className="cx-primary" disabled={mailBusy || !result.input.email} onClick={() => { void sendEmail(); }}>{mailBusy ? 'Enviando…' : 'Enviar consulta por correo electrónico'}</button>{mailStatus ? <p role="status">{mailStatus}</p> : null}{!result.input.email ? <p>Esta consulta anterior no tiene un email registrado.</p> : <p>Se enviará al email registrado: {result.input.email}.</p>}<p>La contratación estará disponible después de validar factibilidad y oferta.</p></section></> : <section className="cx-panel"><h2>Estado de tu solicitud</h2><div className="cx-tracking"><CheckCircle2 /><div><strong>{result.tracking.stage}</strong><p>{result.tracking.state}</p></div></div><p><strong>Siguiente paso:</strong> {result.tracking.nextAction}</p><p><strong>Fecha compromiso:</strong> {result.tracking.commitmentDate || 'Por confirmar'}</p><p>{result.tracking.installationStarted ? "Seguimiento del proyecto de instalación asociado a esta consulta." : "La instalación todavía no ha iniciado. Podrás consultar las etapas de entrega cuando tu instalación inicie."}</p></section>}<button className="cx-secondary" onClick={startNewConsultation}>Nueva consulta</button></div> : null}
    </main><footer className="cx-footer">Link Partner · Conectividad con seguimiento y trazabilidad.</footer>
  </div>;
}

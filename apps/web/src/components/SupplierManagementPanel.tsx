import { useQuery } from '@tanstack/react-query';
import { supplierState, supplierAlerts } from '../lib/supplierManagement';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiSend, ApiError } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { config } from '../config';
import type { Supplier, SupplierManagement, SupplierOperationalState } from '../types';
import './SupplierManagementPanel.css';

const STATES: SupplierOperationalState[] = ['En validación inicial', 'Habilitado provisional', 'Habilitado', 'Condicionado', 'Restringido para nuevas contrataciones'];
const TABS = ['Resumen', 'Requisitos mínimos', 'Desempeño operativo', 'Planes de mejora', 'Historial y autorizaciones', 'Contratos y cobertura'];
export function SupplierManagementPanel({ supplier, onClose, onSaved, onCoverage }: { supplier: Supplier; onClose: () => void; onSaved: () => Promise<void>; onCoverage: () => void }) {
  const { token, user } = useSession();
  const manager = user.roles.some(r => ['internal_admin', 'supplier_manager'].includes(r));
  const approver = user.roles.some(r => ['internal_admin', 'operations_manager'].includes(r));
  const canRecord = manager || user.roles.some(r => ['delivery_manager', 'noc'].includes(r));
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);
  const [tab, setTab] = useState(TABS[0]);
  const managerUsers = useQuery({ queryKey: ['supplier-manager-users', token], queryFn: ({ signal }) => apiGet<NonNullable<SupplierManagement['ownerUser']>[]>('/supplier-manager-users', token, signal), enabled: config.dataMode === 'api', staleTime: 0 });
  const [draft, setDraft] = useState<SupplierManagement | undefined>(supplier.management);
  const [message, setMessage] = useState('');
  const [dirtyForms, setDirtyForms] = useState<Set<string>>(() => new Set());
  const [baseVersion, setBaseVersion] = useState(supplier.management?.version ?? 0);
  const [closeIntent, setCloseIntent] = useState<'close' | 'coverage' | null>(null);
  const [busy, setBusy] = useState(false);
  const evaluation = supplier.evaluation;
  const m = supplier.management;
  function formKey(form: HTMLFormElement) {
    const id = (form.elements.namedItem('id') as HTMLInputElement | null)?.value;
    return `${form.dataset.action}${id ? `:${id}` : ''}`;
  }
  function markDirty(target: EventTarget) {
    const form = (target as HTMLElement).closest<HTMLFormElement>('form[data-action]');
    if (form) setDirtyForms(current => new Set(current).add(formKey(form)));
  }
  function requestClose(intent: 'close' | 'coverage' = 'close') {
    if (busy) return;
    if (dirtyForms.size) { setCloseIntent(intent); return; }
    if (intent === 'coverage') onCoverage(); else onClose();
  }
  function discardDrafts() {
    dialogRef.current?.querySelectorAll<HTMLFormElement>('form[data-action]').forEach(form => form.reset());
    setDraft(m); setBaseVersion(m?.version ?? 0); setDirtyForms(new Set()); setMessage('Versión actual cargada.');
  }
  useEffect(() => {
    if (!dirtyForms.size) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyForms.size]);
  function actionFromForm(form: HTMLFormElement) {
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? '');
    const type = form.dataset.action;
    if (type === 'requirements' && draft) return { type, ownerAuthUid: value('ownerAuthUid'), validationDue: value('validationDue'), nextReview: value('nextReview'), nextCapacityReview: value('nextCapacityReview'), requirements: draft.requirements.map(({ id }) => ({ id, fulfilled: data.has(`fulfilled-${id}`), evidence: value(`evidence-${id}`), validUntil: value(`validUntil-${id}`) || null })) };
    if (type === 'observation') return { type, metric: value('metric'), reference: value('reference'), dueAt: value('dueAt'), completedAt: value('completedAt') || null, outcome: value('outcome'), evidence: value('evidence'), critical: data.has('critical') };
    if (type === 'contract') return { type, sla: value('sla'), contractEnd: value('contractEnd') || null };
    if (type === 'settle-observation') return { type, id: value('id'), completedAt: value('completedAt'), outcome: value('outcome'), evidence: value('evidence') };
    if (type === 'action') return { type, description: value('description'), owner: value('owner'), dueAt: value('dueAt') };
    if (type === 'close-action') return { type, id: value('id'), evidence: value('evidence') };
    if (type === 'authorize') return { type, state: value('state'), reason: value('reason') };
    throw new Error('Formulario de proveedor no reconocido.');
  }
  async function saveChanges(afterSave?: 'close' | 'coverage') {
    if (busy || !dirtyForms.size) return;
    if (config.dataMode !== 'api') { setMessage('Conecta la API para gestionar evidencia real.'); return; }
    const forms = Array.from(dialogRef.current?.querySelectorAll<HTMLFormElement>('form[data-action]') ?? []).filter(form => dirtyForms.has(formKey(form)));
    for (const form of forms) {
      if (!form.checkValidity()) {
        setTab(form.closest<HTMLElement>('[data-section]')!.dataset.section!);
        setMessage('Completa los campos de esta sección. Los cambios de las demás pestañas se conservan.');
        requestAnimationFrame(() => form.reportValidity());
        return;
      }
    }
    setBusy(true); setMessage('');
    try {
      const saved = await apiSend<Supplier>(`/suppliers/${encodeURIComponent(supplier.id)}/management`, token, 'POST', { expectedVersion: baseVersion, actions: forms.map(actionFromForm) });
      setDraft(saved.management); setBaseVersion(saved.management?.version ?? 0); setDirtyForms(new Set()); setCloseIntent(null);
      // Reset only submitted forms; unchanged sections keep their current fields.
      for (const form of forms) if (form.dataset.action !== 'requirements' && form.dataset.action !== 'contract') form.reset();
      setMessage('Todos los cambios se guardaron correctamente.');
      await onSaved();
      if (afterSave === 'coverage') onCoverage(); else if (afterSave === 'close') onClose();
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message} Tus cambios siguen disponibles.` : 'No se pudo guardar. Tus cambios siguen disponibles.');
      if (error instanceof ApiError && error.status === 409) await onSaved();
    } finally { setBusy(false); }
  }
  function handleFormSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void saveChanges(); }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  return <div className="supplier-dialog-backdrop" onMouseDown={e => { if (!busy && e.target === e.currentTarget) requestClose(); }}>
    <section ref={dialogRef} tabIndex={-1} onKeyDown={e => {
      if (e.key === 'Escape' && !busy) requestClose();
      if (e.key === 'Tab') {
        const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') ?? []).filter(el => !el.closest('fieldset:disabled') && el.offsetParent !== null);
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }} className="supplier-management" role="dialog" aria-modal="true" aria-labelledby="management-title">
      <header className="panel__header"><div><small>GESTIÓN CONTINUA DEL PROVEEDOR</small><h2 id="management-title">{supplier.name}</h2></div><button className="button" disabled={busy} onClick={() => requestClose()} aria-label="Cerrar evaluación">Cerrar</button></header>
      <nav className="management-tabs" aria-label="Secciones del proveedor">{TABS.map(label => <button type="button" className={`button ${label === tab ? 'button--primary' : ''}`} key={label} disabled={busy} onClick={() => setTab(label)}>{label}</button>)}</nav>
      <div className="management-body" onChange={event => markDirty(event.target)} onInput={event => markDirty(event.target)}>
        {dirtyForms.size && baseVersion !== (m?.version ?? 0) ? <p role="alert">El proveedor fue actualizado por otro usuario. Tus cambios se conservan. <button type="button" className="button" disabled={busy} onClick={discardDrafts}>Descartar cambios y cargar versión actual</button></p> : null}
        {closeIntent ? <div className="management-close-warning" role="alert"><p>Hay cambios sin guardar en {dirtyForms.size} {dirtyForms.size === 1 ? 'sección' : 'secciones'}.</p><button className="button" disabled={busy} onClick={() => setCloseIntent(null)}>Seguir editando</button><button className="button" disabled={busy} onClick={() => { if (closeIntent === 'coverage') onCoverage(); else onClose(); }}>Descartar y salir</button><button className="button button--primary" disabled={busy} onClick={() => { void saveChanges(closeIntent); }}>Guardar y salir</button></div> : null}
        {message ? <p role="status" className="supplier-feedback">{message}</p> : null}
        <section data-section="Resumen" hidden={tab !== 'Resumen'}>
          <div className="management-summary"><article><small>Estado autorizado</small><h3>{supplierState(supplier)}</h3><p>{m?.authorization?.reason ?? 'Gerencia todavía no ha autorizado un estado.'}</p><small>Clasificación anterior: {supplier.status}</small></article><article><small>ScoreCard · últimos 90 días</small><h3>{evaluation?.score == null ? 'Sin calificación' : `${evaluation.score}/100`}</h3><p>Evidencia: {evaluation?.confidence ?? 'Sin historial'} · cobertura {evaluation?.coverage ?? 0}%</p><small>Recomendación: {evaluation?.recommendation ?? 'En validación inicial'}</small></article></div>
          <p>Gestor: {m?.owner || 'Por asignar'} · Validación: {m?.validationDue || 'Por programar'} · Próxima revisión: {m?.nextReview || 'Por programar'}</p>
          <ul>{supplierAlerts(supplier, today).map(alert => <li key={alert}>{alert}</li>)}</ul>
          <p>El cuestionario es complementario. La falta de respuesta no impide evaluar con evidencia interna. El ScoreCard recomienda; Gerencia autoriza.</p>
          <p>Rutina del gestor: alertas diarias, seguimiento semanal, revisión mensual y capacidad trimestral.</p>
        </section>
        <section data-section="Requisitos mínimos" hidden={tab !== 'Requisitos mínimos'}>{draft ? <form data-action="requirements" onSubmit={handleFormSubmit}>
          {managerUsers.isError ? <p role="alert">{managerUsers.error.message} <button type="button" className="button" onClick={() => { void managerUsers.refetch(); }}>Reintentar directorio</button></p> : null}
          {draft.owner && !draft.ownerUser ? <p>Responsable anterior: {draft.owner}. Selecciona su cuenta de Application Hub para validar la asignación.</p> : null}
          {draft.ownerUser && managerUsers.data && !managerUsers.data.some(u => u.authUid === draft.ownerUser?.authUid) ? <p role="alert">El responsable ya no figura entre los usuarios activos asignados. Selecciona otra cuenta.</p> : null}
          <p>La validación inicial tiene un plazo de diez días hábiles desde el ingreso. Si vence, el gestor debe resolverla o escalarla; no se habilita automáticamente.</p><fieldset disabled={!manager || busy}><div className="management-form-grid"><label>Gestor responsable<select className="control" required disabled={managerUsers.isPending || managerUsers.isError} name="ownerAuthUid" defaultValue={draft.ownerUser?.authUid ?? ''}><option value="">Seleccionar usuario de Application Hub</option>{managerUsers.data?.map(u => <option key={u.authUid} value={u.authUid}>{u.displayName === u.email ? u.email : `${u.displayName} · ${u.email}`}{u.source === 'development' ? ' (desarrollo)' : ''}</option>)}</select></label><label>Fecha límite de validación<input className="control" type="date" required name="validationDue" defaultValue={draft.validationDue} /></label><label>Revisión mensual<input className="control" type="date" required name="nextReview" defaultValue={draft.nextReview} /></label><label>Revisión trimestral de capacidad<input className="control" type="date" required name="nextCapacityReview" defaultValue={draft.nextCapacityReview} /></label></div>
          {draft.requirements.map((r) => <article className="management-record" key={r.id}><label><input type="checkbox" name={`fulfilled-${r.id}`} defaultChecked={r.fulfilled} onChange={e => { const field = e.currentTarget.form?.elements.namedItem(`evidence-${r.id}`); if (field instanceof HTMLInputElement) field.required = e.currentTarget.checked; }} /> {r.label}</label><label>Evidencia / referencia verificada<input className="control" required={r.fulfilled} name={`evidence-${r.id}`} defaultValue={r.evidence} /></label><label>Vigencia, cuando aplique<input className="control" type="date" name={`validUntil-${r.id}`} defaultValue={r.validUntil ?? ''} /></label></article>)}
          </fieldset></form> : <p>Conecta la API para iniciar el expediente.</p>}</section>
        <section data-section="Desempeño operativo" hidden={tab !== 'Desempeño operativo'}>
          <p>Continuidad y soporte 50% · Implementaciones 30% · Respuesta y compromisos 20%. Sin casos aplicables, el peso se redistribuye y se muestra la cobertura.</p>
          <p>Evidencia suficiente: cobertura de al menos 70% y cinco casos por cada indicador evaluado. Regla inicial para el piloto.</p>
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Indicador</th><th>Peso</th><th>Cumplen / evaluables</th><th>Pendientes</th><th>Puntos</th></tr></thead><tbody>{evaluation?.metrics.map(metric => <tr key={metric.id}><td>{metric.label}</td><td>{metric.weight}%</td><td>{metric.complies}/{metric.evaluated}</td><td>{metric.pending}</td><td>{metric.score ?? 'Sin datos'}</td></tr>)}</tbody></table></div>
          <h3>Evidencia de Service Delivery Office</h3><p>Entregas calculadas contra el compromiso original; los proyectos abiertos vencidos cuentan como incumplimiento. Causa y atribución deben revisarse antes de una decisión.</p>
          {evaluation?.deliveryEvidence.length ? evaluation.deliveryEvidence.map(item => <article className="management-record" key={item.id}><Link to={`/deliveries/${item.id}`}>{item.id} · {item.reference}</Link><p>Compromiso: {item.dueAt} · Entrega: {item.completedAt ?? 'Abierta vencida'} · {item.complies ? 'Cumple' : 'No cumple'}</p></article>) : <p>No hay entregas evaluables vinculadas al proveedor en los últimos 90 días.</p>}
          <h3>Registrar evidencia operativa</h3><p>NOC registra enlace-mes e incidentes; Delivery Manager valida calidad; el gestor registra respuestas y compromisos. Usa una referencia única y verificable por caso.</p>
          <form data-action="observation" onSubmit={handleFormSubmit}><fieldset disabled={!canRecord || busy}><div className="management-form-grid"><label>Indicador<select className="control" name="metric">{(evaluation?.metrics ?? []).map(metric => <option value={metric.id} key={metric.id}>{metric.label}</option>)}</select></label><label>Referencia del caso<input className="control" name="reference" required /></label><label>Fecha comprometida<input className="control" name="dueAt" type="date" required /></label><label>Fecha de cierre<input className="control" name="completedAt" type="date" max={today} /></label><label>Resultado<select className="control" name="outcome"><option value="pending">Pendiente</option><option value="complies">Cumple</option><option value="fails">No cumple</option></select></label><label>Evidencia<input className="control" name="evidence" required /></label></div><label><input type="checkbox" name="critical" /> Hallazgo crítico: requiere revisión inmediata</label><p>Un caso pendiente se convierte en incumplimiento al vencer su plazo. No registra cumplimiento por falta de datos.</p></fieldset></form>
          <h3>Registros y referencias</h3>{m?.observations.map(o => <article className="management-record" key={o.id}><strong>{o.reference}</strong><p>{evaluation?.metrics.find(metric => metric.id === o.metric)?.label} · {o.outcome === 'pending' ? 'Pendiente' : o.outcome === 'complies' ? 'Cumple' : 'No cumple'} · {o.critical ? 'Crítico' : 'Operativo'}</p><p>{o.evidence}</p><small>{o.createdBy} · {o.createdAt.slice(0, 10)}</small>{o.outcome === 'pending' ? <form data-action="settle-observation" onSubmit={handleFormSubmit}><fieldset disabled={!canRecord || busy}><input type="hidden" name="id" value={o.id} /><div className="management-form-grid"><label>Fecha de cierre<input className="control" type="date" name="completedAt" required max={today} /></label><label>Resultado<select className="control" name="outcome"><option value="complies">Cumple</option><option value="fails">No cumple</option></select></label><label>Evidencia de cierre<input className="control" name="evidence" required /></label></div></fieldset></form> : null}</article>)}
        </section>
        <section data-section="Planes de mejora" hidden={tab !== 'Planes de mejora'}>
          <form data-action="action" onSubmit={handleFormSubmit}><fieldset disabled={!manager || busy}><div className="management-form-grid"><label>Acción correctiva<input className="control" name="description" required /></label><label>Responsable<input className="control" name="owner" required /></label><label>Fecha límite<input className="control" type="date" name="dueAt" required /></label></div></fieldset></form>
          {m?.actions.length ? m.actions.map(a => <article className="management-record" key={a.id}><strong>{a.description}</strong><p>{a.owner} · {a.dueAt} · {a.status}</p>{a.status === 'Abierta' ? <form data-action="close-action" onSubmit={handleFormSubmit}><fieldset disabled={!manager || busy}><input type="hidden" name="id" value={a.id} /><label>Evidencia de solución<input className="control" name="evidence" required /></label></fieldset></form> : <p>{a.evidence}</p>}</article>) : <p>No hay acciones correctivas registradas.</p>}
        </section>
        <section data-section="Historial y autorizaciones" hidden={tab !== 'Historial y autorizaciones'}>
          <p>Solo Gerencia de Operaciones o administración autorizada pueden cambiar el estado. Los servicios activos continúan atendiéndose.</p>
          <form data-action="authorize" onSubmit={handleFormSubmit}><fieldset disabled={!approver || busy}><label>Estado para nuevas contrataciones<select className="control" name="state">{STATES.map(state => <option key={state}>{state}</option>)}</select></label><label>Motivo y alcance de la decisión<textarea className="control" name="reason" required minLength={10} /></label></fieldset></form>
          {!approver ? <p>Tu perfil permite consultar el historial. La autorización corresponde a Gerencia.</p> : null}
          {m?.history.slice().reverse().map(h => <article className="management-record" key={h.id}><strong>{h.summary}</strong><p>{h.actor} · {new Date(h.at).toLocaleString('es-MX')}</p></article>)}
        </section>
        <section data-section="Contratos y cobertura" hidden={tab !== 'Contratos y cobertura'}><p>Razón social: {supplier.legalName}</p><p>SLA / OLA: {supplier.sla ?? 'Por validar'} · Vencimiento de contrato: {supplier.contractEnd ?? 'Sin fecha registrada'}</p><p>Enlaces activos: {supplier.activeLinks ?? 'Sin datos'}</p><form data-action="contract" onSubmit={handleFormSubmit}><fieldset disabled={!manager || busy}><div className="management-form-grid"><label>SLA / condiciones acordadas<input className="control" name="sla" required defaultValue={supplier.sla ?? ''} /></label><label>Vencimiento del contrato<input className="control" name="contractEnd" type="date" defaultValue={supplier.contractEnd ?? ''} /></label></div></fieldset></form><button className="button" onClick={() => requestClose('coverage')}>Consultar cobertura KML/KMZ</button></section>
      </div>
      <footer className="management-save-bar"><span role="status">{dirtyForms.size ? `${dirtyForms.size} ${dirtyForms.size === 1 ? 'sección con cambios pendientes' : 'secciones con cambios pendientes'}` : 'Sin cambios pendientes'}</span><button type="button" className="button button--primary" disabled={busy || !dirtyForms.size} onClick={() => { void saveChanges(); }}>{busy ? 'Guardando…' : 'Guardar cambios'}</button></footer>
    </section>
  </div>;
}

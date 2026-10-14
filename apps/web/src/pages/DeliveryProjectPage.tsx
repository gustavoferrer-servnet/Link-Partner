import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, CircleDot, Clock3, FileText, Link2, RefreshCw, Route, ShieldCheck } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet, apiSend } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { Status } from '../components/ui/Status';
import type { DeliveryProject, OperationalStatus } from '../types';
import './DeliveryProjectPage.css';

type Tab = 'summary' | 'tasks' | 'gantt' | 'deviations' | 'documents' | 'closures' | 'audit' | 'cfe';
type DeliveryAction = Record<string, unknown> & { type: string };
const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'summary', label: 'Resumen' }, { id: 'tasks', label: 'Actividades' }, { id: 'gantt', label: 'Gantt' },
  { id: 'deviations', label: 'Desvíos' }, { id: 'documents', label: 'Documentos' }, { id: 'closures', label: 'Cierre' }, { id: 'audit', label: 'Auditoría' },
];
const date = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function showDate(value: string | null) { return value ? date.format(new Date(`${value}T12:00:00`)) : 'No disponible'; }
function showDateTime(value: string | null) { return value ? dateTime.format(new Date(value)) : 'Nunca'; }

function progress(project: DeliveryProject) {
  if (!project.tasks.length) return 0;
  return Math.round(project.tasks.filter((task) => task.status === 'Concluido').length / project.tasks.length * 100);
}

function Gantt({ project }: { project: DeliveryProject }) {
  const range = useMemo(() => {
    const starts = project.tasks.flatMap((task) => task.plannedStart ? [new Date(`${task.plannedStart}T12:00:00`).getTime()] : []);
    const ends = project.tasks.flatMap((task) => task.plannedEnd ? [new Date(`${task.plannedEnd}T12:00:00`).getTime()] : []);
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    return { min, max, span: Math.max(86_400_000, max - min) };
  }, [project.tasks]);
  return <div className="gantt" aria-label="Cronograma del proyecto">{project.tasks.map((task) => {
    const start = task.plannedStart ? new Date(`${task.plannedStart}T12:00:00`).getTime() : range.min;
    const end = task.plannedEnd ? new Date(`${task.plannedEnd}T12:00:00`).getTime() : start;
    const left = Math.max(0, (start - range.min) / range.span * 100);
    const width = Math.max(3, (end - start + 86_400_000) / range.span * 100);
    return <div className="gantt__row" key={task.id}><div className="gantt__label"><strong>{task.name}</strong><small>{task.owner} · {task.area}</small></div><div className="gantt__track"><span className={`gantt__bar gantt__bar--${task.scheduleStatus.toLowerCase().replace(' ', '-')}`} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}>{showDate(task.plannedEnd)}</span></div></div>;
  })}</div>;
}

export function DeliveryProjectPage() {
  const { id = '' } = useParams();
  const { token } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('summary');
  const [feedback, setFeedback] = useState('');
  const projectQuery = useQuery({ queryKey: ['delivery-project', id], queryFn: ({ signal }) => apiGet<DeliveryProject>(`/delivery-projects/${encodeURIComponent(id)}`, token, signal), enabled: Boolean(id) });
  const mutation = useMutation({
    mutationFn: (action: DeliveryAction) => apiSend<DeliveryProject>(`/delivery-projects/${encodeURIComponent(id)}/actions`, token, 'POST', action),
    onSuccess: (project) => {
      queryClient.setQueryData(['delivery-project', id], project);
      void queryClient.invalidateQueries({ queryKey: ['delivery-projects'] });
      setFeedback('Cambio guardado y auditado.');
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : 'No fue posible guardar el cambio.'),
  });
  const project = projectQuery.data;

  if (projectQuery.isLoading) return <div className="page"><div className="panel empty-note">Cargando proyecto…</div></div>;
  if (!project) return <div className="page"><div className="panel empty-note text-danger">No fue posible consultar el proyecto.</div></div>;

  const visibleTabs = project.flow === 'Servnet' && project.requiresCfe ? [...tabs.slice(0, 6), { id: 'cfe' as Tab, label: 'CFE' }, tabs[6]] : tabs;
  const percent = progress(project);

  return <div className="page section-stack delivery-detail">
    <Link className="back-link" to="/deliveries"><ArrowLeft size={15} /> Volver a Service Delivery</Link>
    <header className="delivery-hero">
      <div><div className="delivery-hero__eyebrow"><span className={`flow-chip flow-chip--${project.flow.toLowerCase()}`}>{project.flow}</span><Status>{project.scheduleStatus}</Status><span>{project.operationalStatus}</span></div><h1>{project.id} · {project.site}</h1><p>{project.client} · {project.service} · {project.capacity}</p></div>
      <div className="delivery-progress"><strong>{percent}%</strong><span>avance por actividades</span><div><i style={{ width: `${percent}%` }} /></div></div>
    </header>
    <div className="project-trace"><span><small>BO / Oportunidad</small><strong>{project.opportunityId}</strong></span><i>→</i><span><small>Línea de servicio</small><strong>{project.serviceLineId}</strong></span><i>→</i><span><small>Proyecto Delivery</small><strong>{project.id}</strong></span></div>
    <nav className="project-tabs" aria-label="Secciones del proyecto">{visibleTabs.map((item) => <button key={item.id} className={tab === item.id ? 'is-active' : ''} type="button" onClick={() => { setTab(item.id); setFeedback(''); }}>{item.label}</button>)}</nav>
    {feedback ? <div className={`inline-feedback${mutation.isError ? ' inline-feedback--error' : ''}`}>{feedback}</div> : null}

    {tab === 'summary' ? <Summary project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
    {tab === 'tasks' ? <Tasks project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
    {tab === 'gantt' ? <section className="panel"><div className="panel__header"><div><h2>Línea base y cronograma vigente</h2><p>Editar una actividad registra auditoría; no cambia automáticamente la etapa.</p></div></div><Gantt project={project} /></section> : null}
    {tab === 'deviations' ? <Deviations project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
    {tab === 'documents' ? <Documents project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
    {tab === 'closures' ? <Closures project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
    {tab === 'cfe' ? <Cfe project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
    {tab === 'audit' ? <Audit project={project} onAction={(action) => mutation.mutate(action)} pending={mutation.isPending} /> : null}
  </div>;
}

function Summary({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  const [newDate, setNewDate] = useState(project.currentCommitment || '');
  const [reason, setReason] = useState('');
  function submit(event: FormEvent) { event.preventDefault(); onAction({ type: 'reprogram', newDate, reason }); }
  return <div className="delivery-detail__grid"><div className="section-stack">
    <section className="panel detail-card"><div className="panel__header"><h2>Control operativo</h2><span>Fuente: {project.source}</span></div><div className="detail-grid">
      <div><small>Delivery Manager</small><strong>{project.serviceDeliveryOwner}</strong></div><div><small>Etapa</small><strong>{project.stage}</strong></div><div><small>Infraestructura / ejecutor</small><strong>{project.infrastructure}{project.provider ? ` · ${project.provider}` : ''}</strong></div><div><small>Riesgo</small><strong>{project.risk}</strong></div><div className="detail-grid__wide"><small>Próxima acción</small><strong>{project.nextAction}</strong></div>
    </div></section>
    <section className="panel"><div className="panel__header"><h2>Fechas y compromisos</h2><span>Línea base inmutable</span></div><div className="date-strip"><div><small>Original</small><strong>{showDate(project.originalCommitment)}</strong></div><div><small>Vigente</small><strong>{showDate(project.currentCommitment)}</strong></div><div><small>Pronóstico</small><strong>{showDate(project.forecastDate)}</strong></div><div><small>Entrega real</small><strong>{showDate(project.actualDeliveryDate)}</strong></div></div><form className="inline-form" onSubmit={submit}><label>Nueva fecha<input type="date" required value={newDate} onChange={(event) => setNewDate(event.target.value)} /></label><label className="inline-form__grow">Motivo<input required minLength={5} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obligatorio de reprogramación" /></label><button className="button button--primary" disabled={pending || newDate === project.currentCommitment} type="submit">Reprogramar</button></form>{project.commitmentHistory.length ? <div className="history-list">{project.commitmentHistory.map((change) => <p key={change.id}><Clock3 size={14} /><span><strong>{showDate(change.previousDate)} → {showDate(change.newDate)}</strong><small>{change.reason} · {change.author} · {showDateTime(change.changedAt)}</small></span></p>)}</div> : null}</section>
  </div><aside className="section-stack">
    <section className="panel detail-card"><div className="panel__header"><h2>Identidades y origen</h2></div><dl className="reference-list"><div><dt>Solicitud / ticket WSAS</dt><dd>{project.externalRefs.wsasRequestId || 'Pendiente'}</dd></div><div><dt>Objeto HubSpot</dt><dd>{project.externalRefs.hubspotObjectId || 'Pendiente'}</dd></div><div><dt>Servicio ID WSAS</dt><dd>{project.externalRefs.wsasServiceId || 'Aún no generado'}</dd></div><div><dt>Última sincronización</dt><dd>{showDateTime(project.lastSyncAt)}</dd></div><div><dt>Estado</dt><dd><Status>{project.syncStatus}</Status></dd></div></dl></section>
    <section className="panel attention-card"><AlertTriangle size={20} /><div><h3>Cierres independientes</h3><p>La entrega técnica no concluye automáticamente monitoreo, facturación, cierre administrativo ni Customer Experience.</p></div></section>
  </aside></div>;
}

function Tasks({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  return <section className="panel"><div className="panel__header"><div><h2>Actividades y responsabilidades</h2><p>Pueden existir pendientes simultáneos de distintas áreas.</p></div><span>{project.tasks.length} actividades</span></div><div className="table-wrap"><table className="data-table tasks-table"><thead><tr><th>Actividad</th><th>Etapa / área</th><th>Responsable</th><th>Planeado</th><th>Dependencias</th><th>Calendario</th><th>Estado operativo</th><th>Evidencias</th></tr></thead><tbody>{project.tasks.map((task) => <tr key={task.id}><td><strong>{task.name}</strong><small>{task.externalCode || 'Sin código externo'}</small></td><td>{task.stage}<small>{task.area}</small></td><td>{task.owner}</td><td>{showDate(task.plannedStart)}<small>→ {showDate(task.plannedEnd)}</small></td><td>{task.dependencies.length ? task.dependencies.join(', ') : '—'}</td><td><Status>{task.scheduleStatus}</Status></td><td><select aria-label={`Estado de ${task.name}`} disabled={pending} value={task.status} onChange={(event) => onAction({ type: 'task-status', taskId: task.id, status: event.target.value as OperationalStatus })}>{['Pendiente', 'En curso', 'En espera', 'Cancelado', 'Concluido'].map((status) => <option key={status}>{status}</option>)}</select></td><td>{task.evidenceCount}</td></tr>)}</tbody></table></div></section>;
}

function Deviations({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  const [form, setForm] = useState({ area: 'Service Delivery Office', deviationType: 'Riesgo', impact: 'Medio', owner: project.serviceDeliveryOwner, description: '', actions: '', targetDate: '' });
  function submit(event: FormEvent) { event.preventDefault(); onAction({ type: 'add-deviation', ...form, targetDate: form.targetDate || null }); setForm((value) => ({ ...value, description: '', actions: '' })); }
  return <div className="delivery-detail__grid"><section className="panel"><div className="panel__header"><h2>Historial de desvíos</h2><span>{project.deviations.filter((item) => item.status !== 'Resuelto').length} abiertos</span></div><div className="deviation-list">{project.deviations.length ? project.deviations.map((item) => <article key={item.id}><span className={`impact impact--${item.impact.toLowerCase()}`}>{item.impact}</span><div><h3>{item.type} · {item.area}</h3><p>{item.description}</p><small>Acción: {item.actions}</small><small>{item.owner} · objetivo {showDate(item.targetDate)} · {item.status}</small></div></article>) : <div className="empty-note">Sin desvíos registrados.</div>}</div></section><form className="panel action-form" onSubmit={submit}><div className="panel__header"><h2>Registrar desvío</h2></div><label>Área<input required value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} /></label><div className="form-pair"><label>Tipo<select value={form.deviationType} onChange={(event) => setForm({ ...form, deviationType: event.target.value })}><option>Riesgo</option><option>Dependencia</option><option>Bloqueo</option></select></label><label>Impacto<select value={form.impact} onChange={(event) => setForm({ ...form, impact: event.target.value })}><option>Alto</option><option>Medio</option><option>Bajo</option></select></label></div><label>Descripción<textarea required minLength={5} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Acciones<textarea required minLength={3} rows={3} value={form.actions} onChange={(event) => setForm({ ...form, actions: event.target.value })} /></label><div className="form-pair"><label>Responsable<input required value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} /></label><label>Fecha objetivo<input type="date" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} /></label></div><button className="button button--primary" disabled={pending} type="submit">Guardar desvío</button></form></div>;
}

function Documents({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  const [form, setForm] = useState({ name: '', documentType: 'Evidencia', url: '' });
  function submit(event: FormEvent) { event.preventDefault(); onAction({ type: 'add-document', ...form, taskId: null }); setForm({ ...form, name: '', url: '' }); }
  return <div className="delivery-detail__grid"><section className="panel"><div className="panel__header"><h2>Evidencias y documentos</h2><span>{project.documents.length} registros</span></div><div className="document-list">{project.documents.map((document) => <a href={document.url} key={document.id} target="_blank" rel="noreferrer"><FileText size={18} /><span><strong>{document.name}</strong><small>{document.type} · {document.author} · {showDateTime(document.createdAt)}</small></span><Link2 size={14} /></a>)}</div></section><form className="panel action-form" onSubmit={submit}><div className="panel__header"><h2>Vincular documento</h2></div><label>Nombre<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Tipo<select value={form.documentType} onChange={(event) => setForm({ ...form, documentType: event.target.value })}><option>Evidencia</option><option>Acta de entrega</option><option>Memoria técnica</option><option>Fotografías</option><option>Contrato</option><option>Anteproyecto</option></select></label><label>URL segura<input required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://…" /></label><button className="button button--primary" disabled={pending} type="submit">Vincular y auditar</button><small>La carga binaria se habilitará cuando se apruebe el almacenamiento y la retención documental.</small></form></div>;
}

const closureLabels: Array<[keyof DeliveryProject['closures'], string, string]> = [['technicalDelivery', 'Entrega técnica', 'Pruebas, acta y aceptación técnica'], ['monitoring', 'ID y monitoreo', 'Servicio ID y alta efectiva'], ['billing', 'Facturación al cliente', 'Factura emitida'], ['administrative', 'Cierre administrativo', 'Activaciones y documentación'], ['customerExperience', 'Customer Experience', 'Welcome kit y cierre de experiencia'], ['supplierBilling', 'Cierre con tercero', 'Facturación y cierre del carrier']];
function Closures({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  return <section className="panel"><div className="panel__header"><div><h2>Matriz de cierres</h2><p>Cada cierre conserva responsable y estado independiente.</p></div></div><div className="closure-grid">{closureLabels.map(([key, label, description]) => <label key={key}><input type="checkbox" disabled={pending || (key === 'supplierBilling' && project.flow !== 'Terceros')} checked={project.closures[key]} onChange={(event) => onAction({ type: 'toggle-closure', key, value: event.target.checked })} /><span><strong>{label}</strong><small>{key === 'supplierBilling' && project.flow !== 'Terceros' ? 'No aplica para este flujo' : description}</small></span>{project.closures[key] ? <CheckCircle2 size={20} /> : <CircleDot size={20} />}</label>)}</div></section>;
}

function Cfe({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  const [form, setForm] = useState({ route: '', stage: 'Alta', owner: '', nextAction: '', followUpDate: '', year: new Date().getFullYear() });
  function submit(event: FormEvent) { event.preventDefault(); onAction({ type: 'add-cfe-route', ...form, followUpDate: form.followUpDate || null, blockingTaskId: null }); }
  return <div className="delivery-detail__grid"><section className="panel"><div className="panel__header"><h2>Rutas y gestiones CFE</h2><span>{project.cfeRoutes.length} rutas</span></div><div className="cfe-list">{project.cfeRoutes.map((route) => <article key={route.id}><Route size={21} /><div><h3>{route.route} · {route.stage}</h3><p>{route.nextAction}</p><small>{route.owner} · próxima gestión {showDate(route.followUpDate)}</small><small>Alta {showDate(route.registrationDate)} · visita {showDate(route.visitDate)} · liberación {showDate(route.releaseDate)}</small></div></article>)}</div></section><form className="panel action-form" onSubmit={submit}><div className="panel__header"><h2>Nueva ruta CFE</h2></div><label>Ruta<input required value={form.route} onChange={(event) => setForm({ ...form, route: event.target.value })} /></label><div className="form-pair"><label>Etapa<input required value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })} /></label><label>Año<input type="number" value={form.year} onChange={(event) => setForm({ ...form, year: Number(event.target.value) })} /></label></div><label>Responsable<input required value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} /></label><label>Próxima gestión<input required value={form.nextAction} onChange={(event) => setForm({ ...form, nextAction: event.target.value })} /></label><label>Fecha de seguimiento<input type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} /></label><button className="button button--primary" disabled={pending} type="submit">Registrar ruta</button></form></div>;
}

function Audit({ project, onAction, pending }: { project: DeliveryProject; onAction: (action: DeliveryAction) => void; pending: boolean }) {
  return <div className="delivery-detail__grid"><section className="panel"><div className="panel__header"><h2>Bitácora del proyecto</h2><span>Más reciente primero</span></div><div className="audit-list">{project.auditEvents.map((event) => <p key={event.id}><ShieldCheck size={16} /><span><strong>{event.summary}</strong><small>{event.actor} · {event.source} · {showDateTime(event.occurredAt)}</small></span></p>)}</div></section><section className="panel"><div className="panel__header"><h2>Operaciones de sincronización</h2><span>Sin MCP productivo</span></div><div className="sync-list">{project.syncOperations.length ? project.syncOperations.map((operation) => <article key={operation.id}><div><strong>{operation.action}</strong><small>{operation.target} · intento {operation.attempts} · {showDateTime(operation.lastAttemptAt)}</small>{operation.error ? <p>{operation.error}</p> : null}</div><Status>{operation.status}</Status>{operation.status === 'Error' || operation.status === 'Pendiente' ? <button className="button" disabled={pending} type="button" onClick={() => onAction({ type: 'retry-sync', operationId: operation.id })}><RefreshCw size={14} /> Reintentar</button> : null}</article>) : <div className="empty-note">No hay operaciones pendientes.</div>}</div></section></div>;
}

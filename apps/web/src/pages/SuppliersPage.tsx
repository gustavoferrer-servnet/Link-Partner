import { SupplierManagementPanel } from '../components/SupplierManagementPanel';
import { supplierAlerts, supplierState } from '../lib/supplierManagement';
import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileArchive, Map as MapIcon, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { apiGet, apiSend } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { config } from '../config';
import { suppliers } from '../data/demo';
import { useSupplierCoverages } from '../lib/useSupplierCoverages';
import { coverageGeometryCounts, coverageGeometrySummary, coverageSourceLayers, formatCoverageGeometryCounts, parseCoverageFile, type CoverageGeometryCounts, type CoverageLayer } from '../lib/coverageFiles';
import { Status } from '../components/ui/Status';
import { CoverageActivityLog } from '../components/CoverageActivityLog';
import { RetiredCoverageMaps, type RetiredMap } from '../components/RetiredCoverageMaps';
import type { Supplier, SupplierCoverage } from '../types';
import './SuppliersPage.css';

type SupplierKind = Supplier['kind'];
type SupplierStatus = Supplier['status'];

interface SupplierFormState {
  name: string;
  legalName: string;
  kind: SupplierKind;
  status: SupplierStatus;
}

const EMPTY_FORM: SupplierFormState = {
  name: '',
  legalName: '',
  kind: 'Carrier',
  status: 'Pendiente de homologación',
};

const COVERAGE_DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatCoverageDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : COVERAGE_DATE_FORMATTER.format(date);
}

export function SuppliersPage() {
  const { token, user } = useSession();
  const canManage = user.roles.some(role => ['internal_admin', 'supplier_manager'].includes(role));
  const updateInput = useRef<HTMLInputElement>(null);
  const chosenUpdate = useRef<SupplierCoverage | null>(null);
  const parseSequence = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<SupplierCoverage | null>(null);
  useEffect(() => () => { parseSequence.current++; }, []);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const [managedId, setManagedId] = useState<string | null>(() => searchParams.get('provider'));
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'coverage'; supplier: Supplier } | null>(null);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [coverageTargetRevisions, setCoverageTargetRevisions] = useState<(string | undefined)[]>([]);
  const [coverageTargets, setCoverageTargets] = useState<string[]>([]);
  const [coverageFiles, setCoverageFiles] = useState<File[]>([]);
  const [coveragePreviews, setCoveragePreviews] = useState<CoverageLayer[]>([]);
  const [coverageParseError, setCoverageParseError] = useState<string | null>(null);
  const [parsingCoverage, setParsingCoverage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const usesApi = config.dataMode === 'api';

  const supplierQuery = useQuery({
    queryKey: ['suppliers', token],
    refetchInterval: 60000,
    queryFn: ({ signal }) => apiGet<Supplier[]>('/supplier-management', token, signal),
    enabled: usesApi,
  });
  const coverageQuery = useSupplierCoverages(token, usesApi);

  const supplierList = usesApi ? supplierQuery.data ?? [] : suppliers;
  const coverageBySupplier = useMemo(() => {
    const groups = new Map<string, SupplierCoverage[]>();
    for (const coverage of coverageQuery.data ?? []) {
      const group = groups.get(coverage.supplierId);
      if (group) group.push(coverage);
      else groups.set(coverage.supplierId, [coverage]);
    }

    return new Map(Array.from(groups.entries()).map(([supplierId, group]) => {
      const coverages = [...group].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      const latestCoverage = coverages[0];
      if (!latestCoverage) throw new Error(`El proveedor ${supplierId} no contiene archivos de cobertura.`);
      const counts: CoverageGeometryCounts = { polygons: 0, lines: 0, points: 0, other: 0 };
      for (const coverage of coverages) {
        const fileCounts = coverageGeometryCounts(coverage.data);
        counts.polygons += fileCounts.polygons;
        counts.lines += fileCounts.lines;
        counts.points += fileCounts.points;
        counts.other += fileCounts.other;
      }
      return [supplierId, {
        coverages,
        latestCoverage,
        summary: formatCoverageGeometryCounts(counts),
        updatedAtLabel: formatCoverageDate(latestCoverage.updatedAt),
      }];
    }));
  }, [coverageQuery.data]);
  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX');
  const visibleSuppliers = normalizedSearch
    ? supplierList.filter((supplier) => `${supplier.name} ${supplier.legalName} ${supplier.id}`.toLocaleLowerCase('es-MX').includes(normalizedSearch))
    : supplierList;
  const pending = supplierList.filter((supplier) => supplierState(supplier) === 'En validación inicial').length;
  const carriers = supplierList.filter((supplier) => supplier.kind === 'Carrier').length;
  const currentDialogCoverages = dialog?.mode === 'coverage' ? coverageBySupplier.get(dialog.supplier.id) : undefined;
  const previewDetails = useMemo(() => coveragePreviews.map((preview, index) => ({
    file: coverageFiles[index],
    preview,
    layers: coverageSourceLayers({
      id: preview.id,
      supplierId: dialog?.mode === 'coverage' ? dialog.supplier.id : 'SUP-NUEVO',
      supplierName: dialog?.mode === 'coverage' ? dialog.supplier.name : form.name || 'Nuevo proveedor',
      color: preview.color,
      data: preview.data,
    }),
  })), [coverageFiles, coveragePreviews, dialog, form.name]);

  function closeDialog() {
    parseSequence.current++; setParsingCoverage(false); setDeleteTarget(null); chosenUpdate.current = null;
    setDialog(null);
    setForm(EMPTY_FORM);
    setCoverageTargetRevisions([]);
    setCoverageTargets([]);
    setCoverageFiles([]);
    setCoveragePreviews([]);
    setCoverageParseError(null);
  }

  function openCreateDialog() {
    parseSequence.current++; setParsingCoverage(false); setDeleteTarget(null); chosenUpdate.current = null; setFeedback(null);
    setForm(EMPTY_FORM);
    setCoverageTargetRevisions([]);
    setCoverageTargets([]);
    setCoverageFiles([]);
    setCoveragePreviews([]);
    setCoverageParseError(null);
    setDialog({ mode: 'create' });
  }

  function openCoverageDialog(supplier: Supplier) {
    parseSequence.current++; setParsingCoverage(false); setDeleteTarget(null); chosenUpdate.current = null; setFeedback(null);
    setCoverageTargetRevisions([]);
    setCoverageTargets([]);
    setCoverageFiles([]);
    setCoveragePreviews([]);
    setCoverageParseError(null);
    setDialog({ mode: 'coverage', supplier });
  }

  async function handleCoverageFiles(files: File[], target: SupplierCoverage | null = null) {
    const requestId = ++parseSequence.current;
    setDeleteTarget(null); setFeedback(null);
    setCoverageTargets(files.map(() => target?.id ?? 'add'));
    setCoverageTargetRevisions(files.map(() => target?.mapVersion?.revisionId));
    setCoverageFiles(files);
    setCoveragePreviews([]);
    setCoverageParseError(null);
    if (files.length === 0) return;

    setParsingCoverage(true);
    try {
      const supplierIndex = dialog?.mode === 'coverage'
        ? supplierList.findIndex((supplier) => supplier.id === dialog.supplier.id)
        : supplierList.length;
      const baseColorIndex = Math.max(0, supplierIndex);
      const previews = await Promise.all(files.map((file, index) => parseCoverageFile(file, baseColorIndex + index)));
      if (requestId === parseSequence.current) setCoveragePreviews(previews);
    } catch (error) {
      if (requestId === parseSequence.current) setCoverageParseError(error instanceof Error ? error.message : 'No fue posible interpretar el archivo de cobertura.');
    } finally {
      if (requestId === parseSequence.current) setParsingCoverage(false);
    }
  }

  async function refreshCoverages() {
    await Promise.all(['coverage-activity', 'supplier-coverage-versions', 'retired-coverages'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
  }

  async function manageMap(action: 'delete' | 'restore', map: SupplierCoverage | RetiredMap) {
    if (dialog?.mode !== 'coverage' || !canManage) return;
    setSaving(true); setFeedback(null);
    try {
      const path = `/suppliers/${encodeURIComponent(dialog.supplier.id)}/coverages/${encodeURIComponent(map.id)}`;
      if (action === 'delete') await apiSend(path, token, 'DELETE', { expectedRevisionId: map.mapVersion?.revisionId });
      else await apiSend(`${path}/restore`, token, 'POST', { activityId: (map as RetiredMap).activityId });
      await refreshCoverages();
      if (action === 'delete' && coverageTargets.includes(map.id)) { setCoverageFiles([]); setCoveragePreviews([]); setCoverageTargets([]); setCoverageTargetRevisions([]); }
      setFeedback({ tone: 'success', text: action === 'delete' ? `${map.sourceFileName} fue eliminado de la cobertura activa. Los demás archivos se conservan; puedes restaurarlo desde Archivos eliminados.` : `${map.sourceFileName} fue restaurado como una nueva revisión activa.` });
    } catch (error) {
      await refreshCoverages();
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No pudimos modificar este archivo.' });
    } finally { setDeleteTarget(null); setSaving(false); }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || !usesApi) {
      setFeedback({ tone: 'error', text: 'El alta de proveedores requiere conexión con la API.' });
      return;
    }
    if (dialog.mode === 'coverage' && coverageFiles.length === 0) return;

    const replacements = coverageTargets.filter(id => id && id !== 'add');
    if (coverageFiles.length && (coverageTargets.length !== coverageFiles.length || coveragePreviews.length !== coverageFiles.length || coverageTargets.some(id => !id) || new Set(replacements).size !== replacements.length)) { setFeedback({ tone: 'error', text: 'Selecciona qué mapa sustituye cada archivo. Un mapa vigente sólo puede sustituirse una vez por carga.' }); return; }
    setSaving(true);
    setFeedback(null);
    try {
      const supplier = dialog.mode === 'create'
        ? await apiSend<Supplier>('/suppliers', token, 'POST', form)
        : dialog.supplier;

      const activeMaps: SupplierCoverage[] = [];
      for (const [index, parsedCoverage] of coveragePreviews.entries()) {
        const target = currentDialogCoverages?.coverages.find(item => item.id === coverageTargets[index]);
        if (coverageTargets[index] !== 'add' && !target) throw new Error('El mapa seleccionado ya no está vigente.');
        const saved = await apiSend<SupplierCoverage & { activation: { verified: boolean } }>(`/suppliers/${encodeURIComponent(supplier.id)}/coverage`, token, 'PUT', {
          operation: target ? 'replace' : 'add',
          ...(target ? { coverageId: target.id, expectedRevisionId: coverageTargetRevisions[index] } : {}),
          sourceFileName: coverageFiles[index].name, color: parsedCoverage.color, data: parsedCoverage.data,
        });
        if (!saved.activation?.verified) throw new Error('No se pudo confirmar el mapa activo. Actualiza el listado de coberturas.');
        activeMaps.push(saved);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        refreshCoverages(),
      ]);
      setFeedback({
        tone: 'success',
        text: coverageFiles.length > 0 ? `${supplier.name}: ${activeMaps.map(item => `${item.sourceFileName} · versión ${item.mapVersion?.version}`).join('; ')}. Carga y activación verificadas. Las revisiones sustituidas dejan de participar en nuevas consultas.` : `${supplier.name} quedó registrado.`,
      });
      closeDialog();
    } catch (error) {
      await refreshCoverages();
      setCoverageTargetRevisions([]);
    setCoverageTargets([]); setCoverageFiles([]); setCoveragePreviews([]);
      setFeedback({ tone: 'error', text: `${error instanceof Error ? error.message : 'No fue posible guardar el proveedor.'} Revisa los archivos vigentes antes de volver a cargar. Cada archivo se activa por separado.` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page section-stack">
      <header className="page-header">
        <div className="page-header__copy"><h1>Gestión de proveedores</h1><p>EVALUACIÓN CONTINUA · REQUISITOS · DESEMPEÑO · MEJORA · COBERTURA</p></div>
        <div className="page-header__actions"><button className="button button--primary" type="button" disabled={!canManage} onClick={openCreateDialog}><Plus size={16} /> Registrar proveedor</button></div>
      </header>

      {feedback ? <div className={`supplier-feedback supplier-feedback--${feedback.tone}`} role="status">{feedback.text}</div> : null}

      <div className="summary-grid">
        <div className="panel summary-card summary-card--blue"><span>Proveedores registrados</span><strong>{supplierList.length}</strong><small>Red propia y terceros</small></div>
        <div className="panel summary-card summary-card--accent"><span>Carriers</span><strong>{carriers}</strong><small>Catálogo de terceros</small></div>
        <div className="panel summary-card"><span>En validación inicial</span><strong>{pending}</strong><small>Requisitos mínimos por validar</small></div>
        <div className="panel summary-card summary-card--blue"><span>Archivos de cobertura</span><strong>{coverageQuery.data?.length ?? 0}</strong><small>{coverageBySupplier.size} {coverageBySupplier.size === 1 ? 'proveedor' : 'proveedores'} con KML/KMZ</small></div>
      </div>

      <section className="panel"><div className="panel__header"><h2>Bandeja del gestor</h2><small>Diario: alertas · Semanal: acciones · Mensual: desempeño · Trimestral: capacidad</small></div><div className="manager-inbox">
        {supplierList.filter(s => supplierAlerts(s, today).length > 0).map(s => <button className="button" key={s.id} onClick={() => setManagedId(s.id)}><strong>{s.name}</strong><small>{supplierAlerts(s, today).join(' · ')}</small></button>)}
        {!supplierList.some(s => supplierAlerts(s, today).length > 0) ? <p>No hay pendientes de gestión.</p> : null}
      </div></section>

      <section className="panel">
        <div className="panel__header"><h2>Directorio y desempeño</h2><input className="control control--search" placeholder="Buscar proveedor o razón social" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        {supplierQuery.isError ? <div className="empty-note">No fue posible consultar el directorio de proveedores.</div> : supplierQuery.isLoading ? <div className="empty-note">Cargando proveedores…</div> : (
          <div className="table-wrap">
            <table className="data-table supplier-table">
              <thead><tr><th>Proveedor</th><th>Razón social</th><th>Tipo</th><th>Estado</th><th>SLA / OLA</th><th>Scorecard</th><th>Enlaces activos</th><th>Cobertura</th></tr></thead>
              <tbody>{visibleSuppliers.map((supplier) => {
                const coverageDetails = coverageBySupplier.get(supplier.id);
                return (
                  <tr key={supplier.id}>
                    <td><button className="button" type="button" onClick={() => setManagedId(supplier.id)}>{supplier.name}</button><small>{supplier.id}</small></td>
                    <td>{supplier.legalName}</td>
                    <td>{supplier.kind}</td>
                    <td><Status>{supplierState(supplier)}</Status><small>Recomendación: {supplier.evaluation?.recommendation ?? 'Por evaluar'}</small></td>
                    <td>{supplier.sla ?? 'Pendiente'}</td>
                    <td>{supplier.evaluation?.score == null ? 'Sin calificación' : <strong>{supplier.evaluation.score}/100</strong>}<small>{supplier.evaluation?.confidence ?? 'Sin historial'} · cobertura {supplier.evaluation?.coverage ?? 0}%</small></td>
                    <td>{supplier.activeLinks ?? 'Pendiente'}</td>
                    <td>
                      <button className={`coverage-action${coverageDetails ? ' coverage-action--ready' : ''}`} type="button" onClick={() => openCoverageDialog(supplier)}>
                        {coverageDetails ? <MapIcon size={14} /> : <Upload size={14} />}
                        {coverageDetails ? (
                          <span className="coverage-action__copy">
                            <strong>{coverageDetails.coverages.length} {coverageDetails.coverages.length === 1 ? 'archivo' : 'archivos'} · {coverageDetails.summary}</strong>
                            <small title={coverageDetails.latestCoverage.sourceFileName}>Último: {coverageDetails.latestCoverage.sourceFileName}</small>
                            <time dateTime={coverageDetails.latestCoverage.updatedAt}>Actualizado {coverageDetails.updatedAtLabel}</time>
                          </span>
                        ) : <span>Cargar KML/KMZ</span>}
                      </button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            {visibleSuppliers.length === 0 ? <div className="empty-note">No hay proveedores que coincidan con la búsqueda.</div> : null}
          </div>
        )}
      </section>

      {managedId && supplierList.find(s => s.id === managedId) ? <SupplierManagementPanel key={managedId} supplier={supplierList.find(s => s.id === managedId)!} onClose={() => setManagedId(null)} onSaved={async () => { await queryClient.invalidateQueries({ queryKey: ['suppliers'] }); }} onCoverage={() => { const selected = supplierList.find(s => s.id === managedId)!; setManagedId(null); openCoverageDialog(selected); }} /> : null}

      {dialog ? (
        <div className="supplier-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (!saving && event.target === event.currentTarget) closeDialog(); }}>
          <section className="supplier-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title">
            <header>
              <div>
                <span>{dialog.mode === 'create' ? 'NUEVO REGISTRO' : 'COBERTURA DEL PROVEEDOR'}</span>
                <h2 id="supplier-dialog-title">{dialog.mode === 'create' ? 'Registrar proveedor' : dialog.supplier.name}</h2>
              </div>
              <button type="button" aria-label="Cerrar" disabled={saving} onClick={closeDialog}><X size={18} /></button>
            </header>
            <form onSubmit={handleSubmit}>
              {dialog.mode === 'create' ? (
                <div className="supplier-form-grid">
                  <label><span>Nombre comercial</span><input className="control" required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Razón social</span><input className="control" required minLength={2} value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} /></label>
                  <label><span>Tipo</span><select className="control" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as SupplierKind }))}><option>Carrier</option><option>Broker</option><option>Red propia</option></select></label>
                  <p>Ingreso en validación inicial. El gestor verifica requisitos mínimos y Gerencia autoriza la habilitación; el cuestionario es complementario.</p>
                </div>
              ) : null}

              {currentDialogCoverages ? (
                <div className="coverage-current-record">
                  <span>ARCHIVOS VIGENTES · {currentDialogCoverages.coverages.length}</span>
                  <p className="coverage-file-help">Para sustituir un archivo, usa Actualizar junto a su nombre. Cada acción afecta únicamente ese mapa.</p><div className="coverage-current-record__files">
                    {currentDialogCoverages.coverages.map((coverage) => (
                      <article key={coverage.id}>
                        <strong title={coverage.sourceFileName}>{coverage.sourceFileName}</strong>
                        <small>Versión {coverage.mapVersion?.version ?? 1} · Huella {coverage.mapVersion?.sha256?.slice(0,12) || 'por identificar'}</small>
                        <small>{coverageGeometrySummary(coverage.data)}</small>
                        <time dateTime={coverage.updatedAt}>{formatCoverageDate(coverage.updatedAt)} · {coverage.updatedBy}</time>
                        {canManage ? <div className="coverage-file-controls"><button type="button" className="button" disabled={saving || parsingCoverage} aria-label={`Actualizar ${coverage.sourceFileName}`} onClick={() => { chosenUpdate.current = coverage; if (updateInput.current) { updateInput.current.value = ''; updateInput.current.click(); } }}><RefreshCw size={14} />Actualizar</button><button type="button" className="button coverage-delete-button" disabled={saving || parsingCoverage} aria-label={`Eliminar ${coverage.sourceFileName}`} onClick={() => setDeleteTarget(coverage)}><Trash2 size={14} />Eliminar</button></div> : null}
                        {deleteTarget?.id === coverage.id ? <div className="coverage-delete-confirmation" role="group" aria-label={`Confirmar eliminación de ${coverage.sourceFileName}`}><p>¿Eliminar <strong>{coverage.sourceFileName}</strong> de la cobertura activa? Los demás archivos y las consultas guardadas se conservarán.</p><button type="button" className="button" disabled={saving} onClick={() => { void manageMap('delete', deleteTarget); }}>Confirmar eliminación</button><button type="button" className="button" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancelar eliminación</button></div> : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <input ref={updateInput} type="file" hidden accept=".kml,.kmz" disabled={saving || parsingCoverage || !canManage} onChange={event => { const files = Array.from(event.target.files ?? []); if (files.length && chosenUpdate.current) void handleCoverageFiles(files, chosenUpdate.current); }} />
              {dialog.mode === 'coverage' ? <><CoverageActivityLog supplierId={dialog.supplier.id} /><RetiredCoverageMaps supplierId={dialog.supplier.id} canManage={canManage} disabled={saving || parsingCoverage} onRestore={map => { void manageMap('restore', map); }} /></> : null}
              {canManage ? <label className="supplier-coverage-file">
                <FileArchive size={24} />
                <span>
                  <strong>{currentDialogCoverages ? 'Agregar archivos adicionales KML o KMZ' : 'Seleccionar archivos KML o KMZ'}</strong>
                  <small>{coverageFiles.length > 0 ? coverageFiles.map((file) => file.name).join(' · ') : dialog.mode === 'create' ? 'Opcionales durante el alta; se pueden cargar después.' : 'Sólo para mapas independientes nuevos. Para reemplazar uno existente, usa su botón Actualizar.'}</small>
                </span>
                <input type="file" multiple accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" disabled={saving || parsingCoverage} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void handleCoverageFiles(files); }} />
              </label> : <p className="coverage-file-help">Tu perfil permite consultar los archivos. Para actualizarlos o eliminarlos necesitas permisos de administración de coberturas.</p>}

              {parsingCoverage ? <div className="coverage-file-preview">Analizando archivos, carpetas y geometrías…</div> : coverageParseError ? <div className="coverage-file-preview coverage-file-preview--error">{coverageParseError}</div> : previewDetails.length > 0 ? (
                <div className="coverage-file-preview coverage-file-preview--multiple">
                  {previewDetails.map(({ file, preview, layers }, index) => (
                    <article key={`${file.name}-${file.lastModified}`}>
                      <strong>{file.name}</strong>
                      <p><strong>{coverageTargets[index] === 'add' ? 'Agregar un archivo independiente' : `Actualizar únicamente: ${currentDialogCoverages?.coverages.find(item => item.id === coverageTargets[index])?.sourceFileName ?? chosenUpdate.current?.sourceFileName ?? 'Archivo seleccionado'}`}</strong></p>
                      <small>{coverageTargets[index] === 'add' ? 'Se conservarán los demás mapas del proveedor.' : coverageTargets[index] ? 'El nuevo archivo sustituirá la geometría anterior. Sólo la nueva revisión participará en consultas futuras.' : 'FO y MW pueden tener archivos independientes; elige el mapa correcto.'}</small>
                      <small>{layers.length} {layers.length === 1 ? 'capa detectada' : 'capas detectadas'} · {coverageGeometrySummary(preview.data)}</small>
                      <span>{layers.map((layer) => layer.path?.join(' / ') || layer.name).join(' · ')}</span>
                    </article>
                  ))}
                </div>
              ) : null}

              {feedback ? <div className={`supplier-feedback supplier-feedback--${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>{feedback.text}</div> : null}
              <footer>
                <button className="button" type="button" disabled={saving} onClick={closeDialog}>Cancelar</button>
                <button className="button button--primary" type="submit" disabled={!canManage || saving || parsingCoverage || coverageFiles.length !== coveragePreviews.length || (dialog.mode === 'coverage' && !coverageFiles.length)}>{saving ? 'Guardando…' : dialog.mode === 'create' ? 'Registrar proveedor' : coverageTargets.some(id => id !== 'add') ? 'Actualizar archivo' : 'Agregar cobertura'}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

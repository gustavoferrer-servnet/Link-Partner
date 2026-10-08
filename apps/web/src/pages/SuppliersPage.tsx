import { useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileArchive, Map as MapIcon, Plus, Upload, X } from 'lucide-react';
import { apiGet, apiSend } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { config } from '../config';
import { suppliers } from '../data/demo';
import { coverageGeometryCounts, coverageGeometrySummary, coverageSourceLayers, formatCoverageGeometryCounts, parseCoverageFile, type CoverageGeometryCounts, type CoverageLayer } from '../lib/coverageFiles';
import { Status } from '../components/ui/Status';
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
  const { token } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'coverage'; supplier: Supplier } | null>(null);
  const [form, setForm] = useState<SupplierFormState>(EMPTY_FORM);
  const [coverageFiles, setCoverageFiles] = useState<File[]>([]);
  const [coveragePreviews, setCoveragePreviews] = useState<CoverageLayer[]>([]);
  const [coverageParseError, setCoverageParseError] = useState<string | null>(null);
  const [parsingCoverage, setParsingCoverage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const usesApi = config.dataMode === 'api';

  const supplierQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: ({ signal }) => apiGet<Supplier[]>('/suppliers', token, signal),
    enabled: usesApi,
  });
  const coverageQuery = useQuery({
    queryKey: ['supplier-coverages'],
    queryFn: ({ signal }) => apiGet<SupplierCoverage[]>('/supplier-coverages', token, signal),
    enabled: usesApi,
  });

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
  const pending = supplierList.filter((supplier) => supplier.status === 'Pendiente de homologación').length;
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
    setDialog(null);
    setForm(EMPTY_FORM);
    setCoverageFiles([]);
    setCoveragePreviews([]);
    setCoverageParseError(null);
  }

  function openCreateDialog() {
    setForm(EMPTY_FORM);
    setCoverageFiles([]);
    setCoveragePreviews([]);
    setCoverageParseError(null);
    setDialog({ mode: 'create' });
  }

  function openCoverageDialog(supplier: Supplier) {
    setCoverageFiles([]);
    setCoveragePreviews([]);
    setCoverageParseError(null);
    setDialog({ mode: 'coverage', supplier });
  }

  async function handleCoverageFiles(files: File[]) {
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
      setCoveragePreviews(await Promise.all(files.map((file, index) => parseCoverageFile(file, baseColorIndex + index))));
    } catch (error) {
      setCoverageParseError(error instanceof Error ? error.message : 'No fue posible interpretar el archivo de cobertura.');
    } finally {
      setParsingCoverage(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || !usesApi) {
      setFeedback({ tone: 'error', text: 'El alta de proveedores requiere conexión con la API.' });
      return;
    }
    if (dialog.mode === 'coverage' && coverageFiles.length === 0) return;

    setSaving(true);
    setFeedback(null);
    try {
      const supplier = dialog.mode === 'create'
        ? await apiSend<Supplier>('/suppliers', token, 'POST', form)
        : dialog.supplier;

      if (coverageFiles.length > 0) {
        await Promise.all(coveragePreviews.map((parsedCoverage, index) => apiSend<SupplierCoverage>(`/suppliers/${encodeURIComponent(supplier.id)}/coverage`, token, 'PUT', {
          sourceFileName: coverageFiles[index].name,
          color: parsedCoverage.color,
          data: parsedCoverage.data,
        })));
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['supplier-coverages'] }),
      ]);
      setFeedback({
        tone: 'success',
        text: coverageFiles.length > 0 ? `${supplier.name}: ${coverageFiles.length} ${coverageFiles.length === 1 ? 'archivo quedó guardado' : 'archivos quedaron guardados'}.` : `${supplier.name} quedó registrado.`,
      });
      closeDialog();
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No fue posible guardar el proveedor.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page section-stack">
      <header className="page-header">
        <div className="page-header__copy"><h1>Gestión de proveedores</h1><p>CONTRATOS · SLA ESPEJO · ESCALACIÓN · COBERTURA</p></div>
        <div className="page-header__actions"><button className="button button--primary" type="button" onClick={openCreateDialog}><Plus size={16} /> Registrar proveedor</button></div>
      </header>

      {feedback ? <div className={`supplier-feedback supplier-feedback--${feedback.tone}`} role="status">{feedback.text}</div> : null}

      <div className="summary-grid">
        <div className="panel summary-card summary-card--blue"><span>Proveedores registrados</span><strong>{supplierList.length}</strong><small>Red propia y terceros</small></div>
        <div className="panel summary-card summary-card--accent"><span>Carriers</span><strong>{carriers}</strong><small>Catálogo de terceros</small></div>
        <div className="panel summary-card"><span>Pendientes de homologación</span><strong>{pending}</strong><small>Requieren contrato y SLA</small></div>
        <div className="panel summary-card summary-card--blue"><span>Archivos de cobertura</span><strong>{coverageQuery.data?.length ?? 0}</strong><small>{coverageBySupplier.size} {coverageBySupplier.size === 1 ? 'proveedor' : 'proveedores'} con KML/KMZ</small></div>
      </div>

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
                    <td><strong>{supplier.name}</strong><small>{supplier.id}</small></td>
                    <td>{supplier.legalName}</td>
                    <td>{supplier.kind}</td>
                    <td><Status>{supplier.status}</Status></td>
                    <td>{supplier.sla ?? 'Pendiente'}</td>
                    <td>{supplier.score === null ? 'Pendiente' : <strong>{supplier.score}/100</strong>}</td>
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

      {dialog ? (
        <div className="supplier-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section className="supplier-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-dialog-title">
            <header>
              <div>
                <span>{dialog.mode === 'create' ? 'NUEVO REGISTRO' : 'COBERTURA DEL PROVEEDOR'}</span>
                <h2 id="supplier-dialog-title">{dialog.mode === 'create' ? 'Registrar proveedor' : dialog.supplier.name}</h2>
              </div>
              <button type="button" aria-label="Cerrar" onClick={closeDialog}><X size={18} /></button>
            </header>
            <form onSubmit={handleSubmit}>
              {dialog.mode === 'create' ? (
                <div className="supplier-form-grid">
                  <label><span>Nombre comercial</span><input className="control" required minLength={2} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                  <label><span>Razón social</span><input className="control" required minLength={2} value={form.legalName} onChange={(event) => setForm((current) => ({ ...current, legalName: event.target.value }))} /></label>
                  <label><span>Tipo</span><select className="control" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as SupplierKind }))}><option>Carrier</option><option>Broker</option><option>Red propia</option></select></label>
                  <label><span>Estado inicial</span><select className="control" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as SupplierStatus }))}><option>Pendiente de homologación</option><option>En observación</option><option>Solo P3</option><option>Aprobado P2</option></select></label>
                </div>
              ) : null}

              {currentDialogCoverages ? (
                <div className="coverage-current-record">
                  <span>ARCHIVOS VIGENTES · {currentDialogCoverages.coverages.length}</span>
                  <div className="coverage-current-record__files">
                    {currentDialogCoverages.coverages.map((coverage) => (
                      <article key={coverage.id}>
                        <strong title={coverage.sourceFileName}>{coverage.sourceFileName}</strong>
                        <small>{coverageGeometrySummary(coverage.data)}</small>
                        <time dateTime={coverage.updatedAt}>{formatCoverageDate(coverage.updatedAt)} · {coverage.updatedBy}</time>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="supplier-coverage-file">
                <FileArchive size={24} />
                <span>
                  <strong>{coverageFiles.length > 0 ? `${coverageFiles.length} ${coverageFiles.length === 1 ? 'archivo seleccionado' : 'archivos seleccionados'}` : 'Seleccionar archivos KML o KMZ'}</strong>
                  <small>{coverageFiles.length > 0 ? coverageFiles.map((file) => file.name).join(' · ') : dialog.mode === 'create' ? 'Opcionales durante el alta; se pueden cargar después.' : 'Agrega archivos nuevos o actualiza los que tengan el mismo nombre.'}</small>
                </span>
                <input type="file" multiple accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" required={dialog.mode === 'coverage'} onChange={(event) => void handleCoverageFiles(Array.from(event.target.files ?? []))} />
              </label>

              {parsingCoverage ? <div className="coverage-file-preview">Analizando archivos, carpetas y geometrías…</div> : coverageParseError ? <div className="coverage-file-preview coverage-file-preview--error">{coverageParseError}</div> : previewDetails.length > 0 ? (
                <div className="coverage-file-preview coverage-file-preview--multiple">
                  {previewDetails.map(({ file, preview, layers }) => (
                    <article key={`${file.name}-${file.lastModified}`}>
                      <strong>{file.name}</strong>
                      <small>{layers.length} {layers.length === 1 ? 'capa detectada' : 'capas detectadas'} · {coverageGeometrySummary(preview.data)}</small>
                      <span>{layers.map((layer) => layer.path?.join(' / ') || layer.name).join(' · ')}</span>
                    </article>
                  ))}
                </div>
              ) : null}

              <footer>
                <button className="button" type="button" disabled={saving} onClick={closeDialog}>Cancelar</button>
                <button className="button button--primary" type="submit" disabled={saving || parsingCoverage || coverageFiles.length !== coveragePreviews.length}>{saving ? 'Guardando…' : dialog.mode === 'create' ? 'Registrar proveedor' : 'Guardar coberturas'}</button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

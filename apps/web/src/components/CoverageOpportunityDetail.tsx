import { SupplierOperationalBadge } from './SupplierOperationalBadge';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Opportunity } from '../types';
import { CoverageTechnologies, CoverageTechnologyNote } from './CoverageTechnologies';
import { CoverageSupplierMaps } from './CoverageMapVersions';
import { ConsultationLocationMap } from './ConsultationLocationMap';
import { consultationDate } from '../lib/consultations';
import { apiSend } from '../api/client';
import { useSession } from '../auth/SessionContext';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import './DigitalConsultations.css';

export function CoverageOpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const evidence = opportunity.prefeasibility;
  const { token } = useSession();
  const queryClient = useQueryClient();
  const proposal = useMutation({ mutationFn: () => apiSend<Opportunity>(`/opportunities/${encodeURIComponent(opportunity.id)}/proposals`, token, 'POST', {}),
    onSuccess: saved => { queryClient.setQueryData(['opportunity', opportunity.id, token], saved); void queryClient.invalidateQueries({ queryKey: ['opportunities'] }); },
  });
  return <div className="page section-stack digital-consultation-detail">
    <Link className="back-link" to="/opportunities"><ArrowLeft size={15} /> Volver a oportunidades</Link>
    <header className="page-header"><div className="page-header__copy"><h1>{opportunity.siteName}</h1><p>{opportunity.id} · CONSULTA DE COBERTURA {opportunity.consultationCode}</p></div></header>
    <section className="panel"><div className="panel__header"><h2>Consulta guardada</h2></div><div className="panel__body"><dl className="consultation-detail-grid">
      <div><dt>Registrada por</dt><dd>{evidence?.createdBy?.displayName || 'Sin registro histórico'}{evidence?.createdBy?.email ? <small style={{ display: 'block' }}>{evidence.createdBy.email}</small> : null}</dd></div>
      <div><dt>Fecha de registro</dt><dd>{evidence ? consultationDate(evidence.savedAt) : 'Sin registro histórico'}</dd></div>
      <div className="consultation-detail-wide"><dt>Dirección o punto consultado</dt><dd>{opportunity.address}</dd></div>
      <div><dt>Servicio</dt><dd>{opportunity.service}</dd></div><div><dt>Capacidad</dt><dd>{opportunity.capacity}</dd></div>
      <div><dt>Coordenadas</dt><dd>{opportunity.latitude?.toFixed(6)}, {opportunity.longitude?.toFixed(6)}</dd></div>
    </dl><ConsultationLocationMap address={opportunity.address} latitude={opportunity.latitude} longitude={opportunity.longitude} /></div></section>
    <section className="panel"><div className="panel__header"><h2>Prefactibilidad por tecnología</h2></div><div className="panel__body">
      <CoverageTechnologies results={evidence?.coverage.technologies} /><CoverageTechnologyNote />
      {evidence ? <small>Evaluada el {consultationDate(evidence.coverage.checkedAt)}. Resultado histórico guardado con las versiones de mapa utilizadas.</small> : null}
    </div></section>
    <section className="panel"><div className="panel__header"><h2>Resultados por proveedor</h2></div><div className="panel__body section-stack">{evidence?.coverage.suppliers.map(supplier => <div key={supplier.supplierName}><h3>{supplier.supplierName}</h3><SupplierOperationalBadge name={supplier.supplierName} /><CoverageTechnologies results={supplier.technologies} compact /><CoverageSupplierMaps supplier={supplier} versions={evidence.coverage.versions} /></div>)}</div></section>
    <section className="panel"><div className="panel__header"><h2>Nueva propuesta</h2></div><div className="panel__body consultation-detail-copy">
      <p>La oportunidad quedó registrada para preparar la propuesta de {opportunity.service} de {opportunity.capacity}.</p>
      {opportunity.proposalDraft ? <p><strong>Borrador {opportunity.proposalDraft.id}</strong> · creado por {opportunity.proposalDraft.createdBy.displayName} el {consultationDate(opportunity.proposalDraft.createdAt)}. Pendiente de cotización.</p> : <button className="button button--primary" disabled={proposal.isPending} onClick={() => proposal.mutate()}>{proposal.isPending ? 'Generando propuesta…' : 'Generar nueva propuesta'}</button>}
      {proposal.isError ? <p role="alert">{proposal.error.message}</p> : null}
      <p><strong>Precio, SLA y fecha de entrega:</strong> por confirmar después de validar la solución.</p>
      {opportunity.carrierRedundancyRequested ? <p><strong>Redundancia de carrier solicitada:</strong> preparar alternativas con proveedores distintos y validar independencia de rutas.</p> : null}
    </div></section>
  </div>;
}

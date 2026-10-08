import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Opportunity } from '../types';
import { Status } from './ui/Status';

export function OpportunityTable({ items, compact = false }: { items: Opportunity[]; compact?: boolean }) {
  const navigate = useNavigate();

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Oportunidad</th>
            <th>Origen</th>
            <th>Sitio</th>
            <th>Nivel</th>
            <th>SLA</th>
            <th>Entrega</th>
            <th>Estado</th>
            <th aria-label="Acción" />
          </tr>
        </thead>
        <tbody>
          {items.slice(0, compact ? 6 : undefined).map((item) => (
            <tr key={item.id} tabIndex={0} onClick={() => navigate(`/opportunities/${item.id}`)} onKeyDown={(event) => event.key === 'Enter' && navigate(`/opportunities/${item.id}`)}>
              <td><code>{item.id}</code></td>
              <td>{item.origin}</td>
              <td><strong>{item.siteId}</strong><small>{item.city}</small></td>
              <td><span className={`level level--${item.level.toLowerCase()}`}>{item.level}</span></td>
              <td>{item.clientSla}</td>
              <td>{item.deliveryDate}</td>
              <td><Status>{item.status}</Status></td>
              <td><ChevronRight size={15} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

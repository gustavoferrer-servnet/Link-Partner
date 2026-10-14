import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const marginData = [
  { name: 'Red Servnet', mrc: 35, margin: 33 },
  { name: 'P2', mrc: 24, margin: 21 },
  { name: 'P3', mrc: 18, margin: 16 },
];

export function ProfitabilityPage() {
  return (
    <div className="page section-stack">
      <header className="page-header"><div className="page-header__copy"><h1>Rentabilidad por enlace</h1><p>ON-NET VS. OFF-NET · COSTO INTERNO · PRECIO DE VENTA</p></div></header>
      <div className="summary-grid"><div className="panel summary-card summary-card--blue"><span>Margen Red Servnet</span><strong>33%</strong><small>210 enlaces</small></div><div className="panel summary-card summary-card--red"><span>Margen P2</span><strong>21%</strong><small>76 enlaces</small></div><div className="panel summary-card summary-card--accent"><span>Margen P3</span><strong>16%</strong><small>34 enlaces</small></div><div className="panel summary-card"><span>MRC administrado</span><strong>$9.4M</strong><small>MXN mensual</small></div></div>
      <div className="split-layout"><section className="panel"><div className="panel__header"><h2>Margen por nivel y red</h2></div><div className="panel__body"><ResponsiveContainer width="100%" height={320}><BarChart data={marginData}><CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="name" /><YAxis unit="%" /><Tooltip /><Legend /><Bar dataKey="mrc" name="Margen bruto" fill="var(--accent)" radius={[3,3,0,0]} /><Bar dataKey="margin" name="Margen neto" fill="#74bed8" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer></div></section><section className="panel"><div className="panel__header"><h2>Concentración off-net</h2></div><div className="panel__body section-stack">{[['Cirion', '31%'], ['Axtel', '25%'], ['Telmex', '19%'], ['Otros', '25%']].map(([name, value]) => <div key={name}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{name}</span><strong>{value}</strong></div><div style={{ height: 6, background: 'var(--paper-deep)', marginTop: 7 }}><div style={{ height: '100%', width: value, background: 'var(--blue-network)' }} /></div></div>)}</div></section></div>
    </div>
  );
}

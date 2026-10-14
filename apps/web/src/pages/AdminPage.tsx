import { Bell, Database, ShieldCheck, Users } from 'lucide-react';

const settings = [
  { icon: Users, title: 'Compañías y usuarios', description: 'Registro, verificación, roles y límites de aprobación.', value: '18 compañías · 64 usuarios' },
  { icon: ShieldCheck, title: 'Permisos internos', description: 'Roles de Servnet y acceso a módulos de Link Partner.', value: '8 perfiles configurados' },
  { icon: Database, title: 'Fuentes e integraciones', description: 'Cobertura, NetBox, inventario Red, Slack y notificaciones.', value: '4 de 7 conectadas' },
  { icon: Bell, title: 'Reglas y alertas', description: 'Vigencia de precios, riesgo de entrega y renovación de contratos.', value: '12 reglas activas' },
];

export function AdminPage() {
  return (
    <div className="page section-stack">
      <header className="page-header"><div className="page-header__copy"><h1>Administración</h1><p>CONFIGURACIÓN DE LINK PARTNER · SOLO ROLES INTERNOS AUTORIZADOS</p></div></header>
      <div className="section-stack">{settings.map(({ icon: Icon, title, description, value }) => <section className="panel" key={title}><div className="panel__body" style={{ display: 'grid', gridTemplateColumns: '42px 1fr auto', alignItems: 'center', gap: 12 }}><Icon size={22} style={{ color: 'var(--accent)' }} /><div><h2 style={{ fontSize: 16 }}>{title}</h2><p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{description}</p></div><button className="button" type="button">{value}</button></div></section>)}</div>
    </div>
  );
}

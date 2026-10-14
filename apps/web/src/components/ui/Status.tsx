import type { ReactNode } from 'react';

const tones: Record<string, string> = {
  'En análisis': 'blue',
  'Propuesta': 'amber',
  'En entrega': 'green',
  'En tiempo': 'green',
  'En riesgo': 'amber',
  'Retrasado': 'red',
  'Bloqueada': 'red',
  'Bloqueado': 'red',
  'Aprobado P2': 'green',
  'Solo P3': 'blue',
  'En observación': 'red',
  'En validación inicial': 'amber',
  'Habilitado provisional': 'amber',
  'Habilitado': 'green',
  'Condicionado': 'amber',
  'Restringido para nuevas contrataciones': 'red',
  'Pendiente de homologación': 'amber',
  'Propuesta pendiente': 'amber',
  'Revisión técnica': 'amber',
  'Sin cobertura': 'red',
  'Validación pendiente': 'amber',
  'Prefactible': 'green',
  'Por validar': 'amber',
};

export function Status({ children }: { children: ReactNode }) {
  const label = String(children);
  return <span className={`status status--${tones[label] || 'neutral'}`}><i />{children}</span>;
}

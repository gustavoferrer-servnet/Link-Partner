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
  'Pendiente de homologación': 'amber',
};

export function Status({ children }: { children: ReactNode }) {
  const label = String(children);
  return <span className={`status status--${tones[label] || 'neutral'}`}><i />{children}</span>;
}

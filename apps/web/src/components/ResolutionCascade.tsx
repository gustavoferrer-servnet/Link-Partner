import type { ResolutionLevel } from '../types';

const steps = [
  { id: 'P1', title: 'Red Servnet', text: 'Cobertura propia unificada' },
  { id: 'P2', title: 'Proveedor gestionado', text: 'Contrato marco + SLA espejo' },
  { id: 'P3', title: 'Marketplace', text: 'Oferta competitiva con fee' },
] as const;

export function ResolutionCascade({ active = 'P1' }: { active?: ResolutionLevel }) {
  return (
    <div className="cascade" aria-label="Cascada de resolución P1 a P3">
      {steps.map((step, index) => (
        <div key={step.id} className={`cascade__step${step.id === active ? ' cascade__step--active' : ''}`}>
          <span className="cascade__number">{index + 1}</span>
          <span><strong>{step.id} · {step.title}</strong><small>{step.text}</small></span>
          {index < steps.length - 1 ? <i className="cascade__line" /> : null}
        </div>
      ))}
    </div>
  );
}

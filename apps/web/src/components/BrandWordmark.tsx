import './BrandWordmark.css';

export function BrandWordmark({ cx = false, compact = false }: { cx?: boolean; compact?: boolean }) {
  return (
    <strong className={`brand-wordmark${compact ? ' brand-wordmark--compact' : ''}`}>
      {compact ? 'l' : 'link'}<span>{compact ? 'p' : 'partner'}</span>{cx && <b className="brand-wordmark__suffix"> CX</b>}
    </strong>
  );
}

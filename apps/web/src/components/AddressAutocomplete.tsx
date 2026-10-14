import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { config } from '../config';
import './AddressAutocomplete.css';
import { useAddressProviderState } from '../lib/addressProvider';

export interface AddressCandidate { address: string; city: string; latitude: number; longitude: number; precision: 'address' | 'street-or-area'; token: string; provider?: 'google'; placeId?: string; coordinateInput?: boolean }
type AddressOption = AddressCandidate | { address: string; placeId: string; provider: 'google' };
interface Props { value: string; city?: string; name?: string; label: string; visibleLabel?: boolean; placeholder?: string; required?: boolean; onChange: (value: string) => void; onSelect: (candidate: AddressCandidate) => void }
export function AddressAutocomplete({ value, city = '', name, label, visibleLabel = false, placeholder, required, onChange, onSelect }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const interacting = useRef<{ x: number; y: number } | null>(null);
  const resolving = useRef(false);
  const resolution = useRef<AbortController | null>(null);
  const providerQuery = useAddressProviderState();
  const provider = providerQuery.data;
  const [options, setOptions] = useState<AddressOption[]>([]);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const sessionToken = useRef(crypto.randomUUID());
  const selectionRequest = useRef(0);
  const chosen = useRef({ address: '', city: '' });
  useEffect(() => () => { selectionRequest.current++; resolution.current?.abort(); }, []);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) { interacting.current = null; setFocused(false); }
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => {
    if (value === chosen.current.address && input.current) input.current.scrollLeft = 0;
  }, [value]);
  useEffect(() => {
    if (resolving.current) return;
    setOptions([]); setActive(-1); setStatus('');
    if (!focused || value.trim().length < 3 || (value === chosen.current.address && city === chosen.current.city)) return;
    if (!provider) { setStatus(providerQuery.isError ? 'No pudimos cargar el buscador. Recarga la página para reintentar.' : 'Cargando buscador de direcciones…'); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('Buscando direcciones…');
      try {
        const response = await fetch(`${config.apiUrl}/locations/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: value.trim(), city: city.trim(), sessionToken: sessionToken.current }), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'No pudimos buscar esta ubicación.');
        if (controller.signal.aborted) return;
        setOptions(body.data); setStatus(body.data.length ? '' : 'No encontramos opciones. Agrega calle, colonia o ciudad.');
      } catch (error) { if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'No pudimos buscar direcciones. Intenta nuevamente.'); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [value, city, focused, provider?.provider, providerQuery.isError]);
  async function select(option: AddressOption) {
    if (resolving.current) return;
    const originalAddress = value.trim();
    const originalCity = city.trim();
    const current = ++selectionRequest.current;
    resolving.current = true;
    const controller = new AbortController();
    resolution.current = controller;
    chosen.current = { address: option.address, city };
    setFocused(true); setOptions([]); setStatus('Confirmando ubicación…');
    onChange(option.address);
    try {
      let candidate: AddressCandidate;
      if ('token' in option) candidate = option;
      else {
        const response = await fetch(`${config.apiUrl}/locations/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: option.placeId, sessionToken: sessionToken.current, address: originalAddress, city: originalCity }), signal: controller.signal });
        if (!response.ok) throw new Error();
        candidate = (await response.json()).data;
      }
      if (current !== selectionRequest.current) return;
      sessionToken.current = crypto.randomUUID();
      chosen.current = { address: candidate.address, city: candidate.city }; setOptions([]); setStatus(''); setFocused(false); setActive(-1); onSelect(candidate);
    } catch { if (current === selectionRequest.current) { chosen.current = { address: '', city: '' }; setFocused(true); setStatus('No pudimos confirmar esta dirección. Intenta nuevamente.'); } }
    finally { if (current === selectionRequest.current) { resolving.current = false; resolution.current = null; } }
  }
  const expanded = focused && (options.length > 0 || Boolean(status));
  return <div className="address-autocomplete" ref={root}>
    {visibleLabel ? <label htmlFor={id}>{label}</label> : null}
    <input ref={input} id={id} name={name} value={value} aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-options`} aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined} placeholder={placeholder} required={required} minLength={3} maxLength={2048} autoComplete="off" onChange={event => { selectionRequest.current++; resolution.current?.abort(); resolving.current = false; chosen.current = { address: '', city: '' }; setFocused(true); onChange(event.target.value); }} onFocus={() => setFocused(true)} onBlur={event => { if (!interacting.current && !resolving.current && !root.current?.contains(event.relatedTarget as Node)) setFocused(false); }} onKeyDown={event => {
      if (event.key === 'Escape') { setFocused(false); return; }
      if (!options.length || !expanded) { if (event.key === 'Enter' && expanded) event.preventDefault(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(current => current < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length); }
      if (event.key === 'Enter') { event.preventDefault(); void select(options[active >= 0 ? active : 0]); }
    }} />
    {expanded ? <div className="address-autocomplete__dropdown">
      <div id={`${id}-options`} role="listbox" aria-label="Direcciones sugeridas">{options.map((candidate, index) => <button type="button" id={`${id}-option-${index}`} role="option" aria-selected={active === index} className={`address-autocomplete__option${active === index ? ' is-active' : ''}`} key={'placeId' in candidate && candidate.placeId ? candidate.placeId : candidate.address} onPointerDown={event => {
        if (event.button !== 0) return;
        interacting.current = { x: event.clientX, y: event.clientY };
        if (event.pointerType === 'mouse') event.preventDefault();
        else event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerCancel={() => { interacting.current = null; }} onPointerUp={event => {
        const start = interacting.current; interacting.current = null;
        if (event.pointerType !== 'mouse' && start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 12) { event.preventDefault(); void select(candidate); }
      }} onClick={() => void select(candidate)}><MapPin size={18} /><span><strong>{candidate.address}</strong><small>{'coordinateInput' in candidate && candidate.coordinateInput ? 'Punto exacto de las coordenadas ingresadas' : 'precision' in candidate && candidate.precision === 'address' ? 'Dirección encontrada' : 'Calle o zona: verifica el sitio'}</small></span></button>)}</div>
      {status ? <p role="status">{status}</p> : null}
      <small className="address-autocomplete__credit" translate="no">{provider?.provider === 'google' ? 'Google Maps' : provider?.provider === 'photon' ? '© OpenStreetMap contributors' : 'Proveedor por confirmar'}</small>
    </div> : null}
  </div>;
}

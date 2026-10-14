import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, MapPin, X } from 'lucide-react';
import { config } from '../config';
import type { MapLocation } from '../lib/coverageFiles';
import { AddressAutocomplete, type AddressCandidate } from './AddressAutocomplete';
import { NetworkMap } from './NetworkMap';
import './AddressMapPicker.css';

export function AddressMapPicker({ label, selected, onSelect, disabled }: { label: string; selected: AddressCandidate | null; onSelect: (candidate: AddressCandidate) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="cx-address-map-button" disabled={disabled} aria-label={`Seleccionar en mapa: ${label}`} onClick={() => setOpen(true)}><MapPin size={16} aria-hidden="true" />Seleccionar en mapa</button>
    {open ? createPortal(<MapPickerDialog label={label} selected={selected} onSelect={candidate => { onSelect(candidate); setOpen(false); }} onClose={() => setOpen(false)} />, document.body) : null}
  </>;
}

function MapPickerDialog({ label, selected, onSelect, onClose }: { label: string; selected: AddressCandidate | null; onSelect: (candidate: AddressCandidate) => void; onClose: () => void }) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(selected?.address ?? '');
  const [focus, setFocus] = useState<MapLocation | null>(() => selected ? { lat: selected.latitude, lng: selected.longitude, label: selected.address } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function close() { dialog.current?.close(); onClose(); }
  useEffect(() => {
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { request.current?.abort(); document.body.style.overflow = previousOverflow; };
  }, []);

  async function selectPoint(point: MapLocation) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setFocus(point);
    try {
      const response = await fetch(`${config.apiUrl}/locations/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: `${point.lat}, ${point.lng}`, sessionToken: crypto.randomUUID() }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'No pudimos validar este punto. Selecciona otro punto o intenta nuevamente.');
      const candidate: AddressCandidate | undefined = body.data?.find((option: AddressCandidate) => option.token && option.latitude === point.lat && option.longitude === point.lng);
      if (!candidate) throw new Error('No pudimos confirmar el punto exacto. Selecciona otro punto.');
      if (!controller.signal.aborted) { dialog.current?.close(); onSelect(candidate); }
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'No pudimos validar este punto. Intenta nuevamente.');
    } finally {
      if (!controller.signal.aborted) { request.current = null; setBusy(false); }
    }
  }

  return <dialog ref={dialog} className="cx-address-map-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <header><div><h2 id={`${id}-title`}>Selecciona tu ubicación</h2><p>{label}</p></div><button type="button" className="cx-address-map-close" aria-label="Cerrar mapa" onClick={close} autoFocus><X size={22} /></button></header>
    <p id={`${id}-help`}>Busca una zona, acerca el mapa y toca el punto de instalación. El mapa se cerrará al confirmar la ubicación.</p>
    <fieldset disabled={busy} className="cx-address-map-search"><AddressAutocomplete visibleLabel label="Buscar una zona en el mapa" value={query} placeholder="Dirección, coordenadas o enlace de Google Maps" onChange={setQuery} onSelect={candidate => { setQuery(candidate.address); setFocus({ lat: candidate.latitude, lng: candidate.longitude, label: candidate.address }); }} /></fieldset>
    <NetworkMap compact locationPin ariaLabel={`Seleccionar ubicación: ${label}`} focusLocation={focus} onLocationSelect={point => { void selectPoint(point); }} />
    <div className="cx-address-map-status" aria-live="polite">{busy ? <span><LoaderCircle size={18} />Confirmando ubicación…</span> : error ? <p role="alert">{error}</p> : <span>La consulta usará las coordenadas exactas del punto seleccionado.</span>}</div>
  </dialog>;
}

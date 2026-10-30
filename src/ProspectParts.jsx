import { useMemo, useState } from 'react';
import { ExternalLink, Trash2 } from 'lucide-react';
import {
  PROSPECT_FAMILIES,
  PROSPECT_OUTCOMES,
  PROSPECT_STATES,
  REJECTION_REASONS,
  possibleWhatsAppLink,
} from './prospect-model.mjs';
import { missingContact } from './prospect-queue.mjs';
import { contactQuality } from './prospect-contact.mjs';
import { buildOutreachDraft } from './prospect-outreach.mjs';
import { outreachVariant } from './prospect-model.mjs';
import { reviewLabel } from './prospect-signals.mjs';

// Partes de Prospección: la cola de trabajo, la planilla, las tarjetas, la ficha del prospecto y el
// historial de búsquedas. Salieron de Prospeccion.jsx (QA 16/10: tenía 1.148 líneas), sin cambios.
function statusClass(status) {
  if (status === 'Nuevo') return 'badge ok';
  if (status === 'Posible duplicado') return 'badge warn';
  return 'badge';
}

export function ProspectRow({ prospect, check, onMark, onOpenClient, onDelete, onEnrich }) {
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState('');
  const [outcome, setOutcome] = useState(prospect.outcome || '');
  const whatsapp = possibleWhatsAppLink(prospect.phone);
  const bestMatch = check.matches[0];
  return (
    <article className="unit-card">
      <div>
        <strong>{prospect.company}</strong>
        <span>{[prospect.family, prospect.rubro, [prospect.city, prospect.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Sin datos de rubro o zona'}</span>
        <span>
          {prospect.phone || 'sin teléfono'}
          {whatsapp && <> · <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp (posible)</a></>}
          {prospect.website && <> · <a href={/^https?:/.test(prospect.website) ? prospect.website : `https://${prospect.website}`} target="_blank" rel="noreferrer">sitio web</a></>}
          {prospect.email && <> · {prospect.email}</>}
          {prospect.instagram && <> · <a href={prospect.instagram} target="_blank" rel="noreferrer">Instagram</a></>}
          {prospect.facebook && <> · <a href={prospect.facebook} target="_blank" rel="noreferrer">Facebook</a></>}
        </span>
        {enrichNote && <span className="muted">{enrichNote}</span>}
        <span>
          <em className={statusClass(check.status)}>{check.status}</em>
          {prospect.competitor && <em className="badge warn"> Competencia</em>}
          {bestMatch && <> con <strong>{bestMatch.name}</strong> ({bestMatch.signals.map((item) => item.label).join(', ')})</>}
          {' · '}Fuente: {prospect.source}
        </span>
        {prospect.linkedClientId && (
          <span><button type="button" className="link-button" onClick={() => onOpenClient(prospect.linkedClientId)}><ExternalLink size={12} /> Abrir la ficha en Empresas</button></span>
        )}
      </div>
      <div className="unit-card-actions">
        {PROSPECT_STATES.map((state) => (
          <button
            key={state}
            type="button"
            className={prospect.state === state ? 'primary' : 'secondary'}
            onClick={() => onMark(prospect.id, state, state === 'Sin interés' ? outcome : '')}
          >
            {state}
          </button>
        ))}
        <select aria-label="Detalle opcional" value={outcome} onChange={(event) => { setOutcome(event.target.value); if (prospect.state === 'Sin interés' || event.target.value) onMark(prospect.id, prospect.state === 'No contactado' && event.target.value ? 'Sin interés' : prospect.state, event.target.value); }}>
          <option value="">Detalle (opcional)</option>
          {PROSPECT_OUTCOMES.map((item) => <option key={item}>{item}</option>)}
        </select>
        {prospect.website && !/(facebook|instagram|wa\.me)/i.test(prospect.website) && (
          <button
            type="button" className="secondary" disabled={enriching}
            onClick={async () => { setEnriching(true); setEnrichNote(await onEnrich(prospect)); setEnriching(false); }}
          >
            {enriching ? 'Leyendo el sitio…' : 'Buscar redes y contacto en su sitio'}
          </button>
        )}
        <button type="button" className="icon-button" aria-label="Eliminar prospecto" onClick={() => onDelete(prospect.id)}><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function prospectsCsv(rows) {
  const head = ['Empresa', 'Familia', 'Rubro', 'Direccion', 'Localidad', 'Provincia', 'Telefono', 'Sitio web', 'Email', 'Instagram', 'Facebook', 'Estado', 'Motivo', 'Puntaje', 'Encaje', 'Zona', 'Fuente'];
  const lines = rows.map((item) => [item.company, item.family, item.rubro, item.address, item.city, item.province, item.phone, item.website, item.email, item.instagram, item.facebook, item.state, item.outcome, item.sheetScore ?? '', item.fitLevel, item.zone, item.source].map(csvCell).join(';'));
  return `\ufeff${[head.map(csvCell).join(';'), ...lines].join('\r\n')}`;
}

export function downloadCsv(rows, name = '') {
  const url = URL.createObjectURL(new Blob([prospectsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(name || `prospectos-${new Date().toISOString().slice(0, 10)}`).replace(/[^\p{L}\p{N}-]+/gu, '_')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// Planilla: los prospectos como filas, para recorrerlos rápido y marcar el estado en el momento.
export function ProspectSheet({ rows, checks, onMark, onOpenClient, onDelete, onOpen }) {
  return (
    <div className="prospect-sheet">
      <table>
        <thead><tr><th>Empresa</th><th>Rubro</th><th>Localidad</th><th>Teléfono</th><th>Sitio / redes</th><th>Estado</th><th>Cruce</th><th /></tr></thead>
        <tbody>
          {rows.map((item) => {
            const check = checks.get(item.id) || { status: 'Nuevo', matches: [] };
            const whatsapp = possibleWhatsAppLink(item.phone);
            return (
              <tr key={item.id} className={item.competitor ? 'competitor' : ''}>
                <td><button type="button" className="link-button" onClick={() => onOpen(item.id)}><strong>{item.company}</strong></button>{item.competitor && <em className="badge warn"> Competencia</em>}<br /><span className="muted small">{[item.family, item.source].filter(Boolean).join(' · ')}</span></td>
                <td>{item.rubro || '–'}</td>
                <td>{[item.city, item.province].filter(Boolean).join(', ') || '–'}</td>
                <td>{item.phone || '–'}{whatsapp && <> · <a href={whatsapp} target="_blank" rel="noreferrer">WhatsApp (posible)</a></>}</td>
                <td className="wrap">
                  {item.website ? <a href={/^https?:/.test(item.website) ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer">sitio</a> : '–'}
                  {item.instagram && <> · <a href={item.instagram} target="_blank" rel="noreferrer">Instagram</a></>}
                  {item.facebook && <> · <a href={item.facebook} target="_blank" rel="noreferrer">Facebook</a></>}
                  {item.email && <><br />{item.email}</>}
                </td>
                <td>
                  <select aria-label={`Estado de ${item.company}`} value={item.state} onChange={(event) => onMark(item.id, event.target.value, '')}>
                    {PROSPECT_STATES.map((state) => <option key={state}>{state}</option>)}
                  </select>
                </td>
                <td><em className={statusClass(check.status)}>{check.status}</em>{item.linkedClientId && <> <button type="button" className="link-button" onClick={() => onOpenClient(item.linkedClientId)}>Abrir ficha</button></>}</td>
                <td><button type="button" className="icon-button" aria-label={`Eliminar ${item.company}`} onClick={() => onDelete(item.id)}><Trash2 size={14} /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Suma una provincia o localidad al texto del alcance ("todo el país" se reemplaza).
export function addToScope(scope = '', name = '') {
  if (!name) return scope;
  const parts = String(scope).split(',').map((part) => part.trim()).filter((part) => part && !/^todo el pa[ií]s$/i.test(part));
  return [...new Set([...parts, name])].join(', ');
}

const FICHA_FIELDS = [
  ['company', 'Empresa'], ['rubro', 'Rubro'], ['address', 'Dirección'], ['city', 'Localidad'], ['province', 'Provincia'],
  ['phone', 'Teléfono'], ['email', 'Mail'], ['website', 'Sitio web'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['contact', 'Persona de contacto'],
];

// Ficha del prospecto: todo lo que se sabe, editable, y desde dónde salió.
export function ProspectDetail({ defaultSender, prospect, check, onClose, onSave, onMark, onBlock, onArmMail, onEnrich, onOpenClient, onDelete }) {
  const [form, setForm] = useState({ ...prospect });
  const [note, setNote] = useState('');
  const quality = contactQuality(form);
  const whatsapp = possibleWhatsAppLink(form.phone) || quality.phone?.whatsapp || '';
  const dirty = FICHA_FIELDS.some(([key]) => (form[key] || '') !== (prospect[key] || '')) || (form.notes || '') !== (prospect.notes || '') || form.family !== prospect.family;
  return (
    <aside className="prospect-drawer" role="dialog" aria-label={`Ficha de ${prospect.company}`}>
      <div className="drawer-head">
        <div>
          <span className="eyebrow">Ficha del prospecto</span>
          <h3>{prospect.company}</h3>
          <span className="muted small">{[prospect.family, prospect.rubro, [prospect.city, prospect.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
        </div>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      <div className="drawer-body">
        <p>
          <em className={statusClass(check.status)}>{check.status}</em>{' '}
          {check.matches[0] && <>con <strong>{check.matches[0].name}</strong> ({check.matches[0].signals.map((item) => item.label).join(', ')})</>}
          {prospect.competitor && <em className="badge warn"> Competencia</em>}
        </p>
        <div className="drawer-quick">
          {form.phone && <a className="secondary link-pill" href={`tel:${String(form.phone).replace(/[^\d+]/g, '')}`}>Llamar</a>}
          {whatsapp && <a className="secondary link-pill" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp (posible)</a>}
          {form.email && <a className="secondary link-pill" href={`mailto:${form.email}`}>Escribir mail</a>}
          {form.website && <a className="secondary link-pill" href={/^https?:/.test(form.website) ? form.website : `https://${form.website}`} target="_blank" rel="noreferrer">Sitio web</a>}
          {form.instagram && <a className="secondary link-pill" href={form.instagram} target="_blank" rel="noreferrer">Instagram</a>}
          {form.facebook && <a className="secondary link-pill" href={form.facebook} target="_blank" rel="noreferrer">Facebook</a>}
        </div>
        {quality.notes.length > 0 && <p className="muted small contact-quality">{quality.notes.join(' · ')}.</p>}
        <ResearchBox research={prospect.research} />
        <OutreachDraft prospect={form} defaultSender={defaultSender} onVariant={(variant) => { setForm({ ...form, variant }); onSave(prospect.id, { variant }); }} />
        {missingContact(form).length > 0 && <p className="muted small">Falta: {missingContact(form).join(', ')}.</p>}
        <div className="form-grid">
          <label>Familia
            <select value={form.family || ''} onChange={(event) => setForm({ ...form, family: event.target.value })}>
              <option value="">Sin definir</option>
              {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
            </select>
          </label>
          {FICHA_FIELDS.map(([key, label]) => (
            <label key={key}>{label}<input value={form[key] || ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>
          ))}
          <label className="span-2">Notas y evidencia
            <textarea rows={4} value={form.notes || ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <label className="span-2">Agregar una nota
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="ej. hablé con Marta, pide catálogo" />
          </label>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="primary" disabled={!dirty && !note.trim()} onClick={() => { onSave(prospect.id, { ...form, notes: [form.notes, note.trim() && `${new Date().toLocaleDateString('es-AR')}: ${note.trim()}`].filter(Boolean).join('\n') }); setNote(''); }}>Guardar cambios</button>
          {prospect.website && !/(facebook|instagram|wa\.me)/i.test(prospect.website) && <button type="button" className="secondary" onClick={() => onEnrich(prospect)}>Buscar redes y contacto en su sitio</button>}
        </div>
        <h4>Estado</h4>
        <div className="panel-head-actions">
          {PROSPECT_STATES.map((state) => <button key={state} type="button" className={prospect.state === state ? 'primary' : 'secondary'} onClick={() => onMark(prospect.id, state, '')}>{state}</button>)}
          {onArmMail && prospect.email && <button type="button" className="secondary" onClick={() => onArmMail(prospect)}>Armar mails (3 pasos)</button>}
          {onBlock && <button type="button" className="danger-link" onClick={() => { if (window.confirm(`¿Agregar a ${prospect.company || 'este prospecto'} a la lista de No contactar?`)) onBlock(prospect, 'Marcado desde la ficha'); }}>No contactar nunca</button>}
        </div>
        <p className="muted small">
          Fuente: {prospect.source}{prospect.createdAt ? ` · cargado el ${String(prospect.createdAt).slice(0, 10)}` : ''}
          {prospect.markedBy ? ` · última marca: ${prospect.markedBy}${prospect.markedAt ? ` el ${String(prospect.markedAt).slice(0, 10)}` : ''}` : ''}
          {prospect.enrichedAt ? ` · enriquecido el ${String(prospect.enrichedAt).slice(0, 10)}` : ''}
        </p>
        {prospect.linkedClientId && <button type="button" className="link-button" onClick={() => onOpenClient(prospect.linkedClientId)}><ExternalLink size={12} /> Abrir la ficha en Empresas</button>}
        <button type="button" className="danger-link" onClick={() => { onDelete(prospect.id); onClose(); }}>Eliminar prospecto</button>
      </div>
    </aside>
  );
}

// Cola de trabajo: de a uno, el más prometedor primero; marcar o saltar y pasa al siguiente.
function OutreachDraft({ prospect, defaultSender, onVariant }) {
  const [sender, setSender] = useState(() => { try { return localStorage.getItem('poliplast-sender-name') || defaultSender; } catch { return defaultSender; } });
  const [channel, setChannel] = useState('whatsapp');
  const [edited, setEdited] = useState({});
  const [copied, setCopied] = useState('');
  const draft = useMemo(() => buildOutreachDraft(prospect, { sender }), [prospect, sender]);
  const variant = outreachVariant(prospect);
  const generated = { whatsapp: draft.whatsapp, email: `Asunto: ${draft.email.subject}\n\n${draft.email.body}`, call: draft.call, followUp: draft.followUp };
  const text = edited[channel] ?? generated[channel];
  function changeSender(value) {
    setSender(value);
    setEdited({});
    try { localStorage.setItem('poliplast-sender-name', value); } catch { /* sin almacenamiento */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(channel); setTimeout(() => setCopied(''), 1800); } catch { setCopied('error'); }
  }
  return (
    <details className="outreach-draft">
      <summary><strong>Borrador de primer contacto</strong> <span className="muted small">armado con la guía de Academia y los datos de esta ficha</span></summary>
      <div className="outreach-body">
        <label>Tu nombre (va en el mensaje)
          <input value={sender} onChange={(event) => changeSender(event.target.value)} placeholder="ej. Marta" />
        </label>
        <div className="segmented" role="tablist" aria-label="Canal del borrador">
          {[['whatsapp', 'WhatsApp'], ['email', 'Mail'], ['followUp', 'Seguimiento'], ['call', 'Guion de llamada']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={channel === key} className={channel === key ? 'selected' : ''} onClick={() => setChannel(key)}>{label}</button>
          ))}
        </div>
        {channel === 'whatsapp' && (
          <p className="muted small">
            Versión {variant} ({variant === 'A' ? 'presentación completa' : 'directa, una sola pregunta'}). Se alternan entre empresas para ver cuál responde más.
            {onVariant && <> <button type="button" className="link-button" onClick={() => onVariant(variant === 'A' ? 'B' : 'A')}>Usar la versión {variant === 'A' ? 'B' : 'A'}</button></>}
          </p>
        )}
        <textarea rows={['whatsapp', 'followUp'].includes(channel) ? 6 : 9} aria-label={`Borrador de ${channel}`} value={text} onChange={(event) => setEdited({ ...edited, [channel]: event.target.value })} />
        <div className="panel-head-actions">
          <button type="button" className="primary" onClick={copy}>{copied === channel ? 'Copiado ✓' : 'Copiar texto'}</button>
          {edited[channel] != null && <button type="button" className="secondary" onClick={() => setEdited({ ...edited, [channel]: undefined })}>Volver al original</button>}
        </div>
        <p className="muted small">
          {draft.usesResearch ? 'Incluye lo que encontró la investigación sobre esta empresa. ' : 'Sin investigación previa: usa solo rubro y ciudad. '}
          {draft.missing.length > 0 && `Faltan datos en la ficha: ${draft.missing.join(', ')}. `}
          Revisalo y editalo antes de usarlo. El CRM no envía nada: lo copiás y lo mandás vos.
        </p>
      </div>
    </details>
  );
}

// Puntaje, encaje y zona que vinieron de la planilla de prospección.
export function SheetBadges({ prospect }) {
  const items = [
    prospect.zone && `Zona ${prospect.zone}`,
    prospect.fitLevel && `Encaje ${prospect.fitLevel}`,
    Number.isFinite(Number(prospect.sheetScore)) && prospect.sheetScore !== null && prospect.sheetScore !== '' && `Puntaje ${prospect.sheetScore}`,
  ].filter(Boolean);
  if (!items.length) return null;
  return <p className="sheet-badges">{items.map((item) => <em key={item} className="badge">{item}</em>)}</p>;
}

function ResearchBox({ research }) {
  if (!research) return null;
  return (
    <div className="research-box">
      {reviewLabel(prospect) && <p><strong>Mapa:</strong> {reviewLabel(prospect)}</p>}
      <p><strong>Investigación en la app:</strong> <em className={research.score >= 60 ? 'badge ok' : 'badge'}>{research.label} · {research.score}/100</em></p>
      <ul>{(research.reasoning || []).map((line, index) => <li key={index}>{line}</li>)}</ul>
      {(research.evidence || []).map((item, index) => (
        <blockquote key={index}>{item.snippet}{item.url && <> <a href={item.url} target="_blank" rel="noreferrer">fuente</a></>}</blockquote>
      ))}
    </div>
  );
}

export function ProspectQueue({ queue, byId, checks, onMark, onBlock, onArmMail, onSkip, onOpen, onEnrich, onResearch }) {
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const current = byId.get(queue[0]);
  if (!current) return <p className="muted">No quedan prospectos pendientes con estos filtros. Preparé una investigación o hacé una búsqueda rápida para sumar más.</p>;
  const check = checks.get(current.id) || { status: 'Nuevo', matches: [] };
  const quality = contactQuality(current);
  const whatsapp = possibleWhatsAppLink(current.phone) || quality.phone?.whatsapp || '';
  const missing = missingContact(current);
  return (
    <article className="queue-card">
      <div className="queue-count"><strong>{queue.length}</strong> pendientes · siguiente</div>
      <h3>{current.company}</h3>
      <p className="muted">{[current.family, current.rubro, [current.city, current.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Sin datos de rubro o zona'}</p>
      <p><em className={statusClass(check.status)}>{check.status}</em>{check.matches[0] && <> con <strong>{check.matches[0].name}</strong></>} <span className="muted small">· Fuente: {current.source}</span></p>
      <SheetBadges prospect={current} />
      {current.notes && <p className="queue-notes">{current.notes}</p>}
      <div className="drawer-quick">
        {current.phone && <a className="secondary link-pill" href={`tel:${String(current.phone).replace(/[^\d+]/g, '')}`}>Llamar {current.phone}</a>}
        {whatsapp && <a className="secondary link-pill" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp (posible)</a>}
        {current.email && <a className="secondary link-pill" href={`mailto:${current.email}`}>{current.email}</a>}
        {current.website && <a className="secondary link-pill" href={/^https?:/.test(current.website) ? current.website : `https://${current.website}`} target="_blank" rel="noreferrer">Sitio web</a>}
        {current.instagram && <a className="secondary link-pill" href={current.instagram} target="_blank" rel="noreferrer">Instagram</a>}
        {current.facebook && <a className="secondary link-pill" href={current.facebook} target="_blank" rel="noreferrer">Facebook</a>}
      </div>
      {quality.notes.length > 0 && <p className="muted small contact-quality">{quality.notes.join(' · ')}.</p>}
      {current.markedBy && <p className="muted small">Última marca: {current.markedBy}{current.markedAt ? ` el ${String(current.markedAt).slice(0, 10)}` : ''}.</p>}
      <ResearchBox research={current.research} />
      {missing.length > 0 && <p className="muted small">Falta: {missing.join(', ')}. {current.website ? 'Probá "Buscar redes y contacto" antes de contactar.' : ''}</p>}
      <div className="queue-actions">
        <button type="button" className="primary big" onClick={() => { onMark(current.id, 'Contactado', ''); setOutcome(''); }}>Contactado</button>
        <button type="button" className="primary big" onClick={() => { onMark(current.id, 'Con interés', ''); setOutcome(''); }}>Con interés</button>
        <select aria-label="Motivo si no tiene interés" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="">Motivo (opcional)</option>
          {PROSPECT_OUTCOMES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" className="secondary" onClick={() => { onMark(current.id, 'Sin interés', outcome); setOutcome(''); }}>Sin interés</button>
        <div className="reason-chips" role="group" aria-label="Rechazo en un toque">
          <span className="muted small">No avanzó por:</span>
          {REJECTION_REASONS.map((reason) => (
            <button key={reason} type="button" className="secondary chip" onClick={() => { onMark(current.id, 'Sin interés', reason); setOutcome(''); }}>{reason}</button>
          ))}
        </div>
        <button type="button" className="secondary" onClick={() => onSkip(current.id)}>Saltar por hoy</button>
        {onArmMail && current.email && <button type="button" className="secondary" onClick={() => onArmMail(current)}>Armar mails (3 pasos)</button>}
        {onBlock && <button type="button" className="secondary" onClick={() => { if (window.confirm(`¿Agregar a ${current.company || 'este prospecto'} a la lista de No contactar? No va a volver a aparecer en las colas.`)) onBlock(current, 'Marcado desde la cola'); }}>No contactar nunca</button>}
        <button type="button" className="secondary" onClick={() => onOpen(current.id)}>Abrir ficha</button>
        {current.website && !/(facebook|instagram|wa\.me)/i.test(current.website) && <button type="button" className="secondary" onClick={() => onEnrich(current)}>Buscar redes y contacto</button>}
        {current.website && !/(facebook|instagram|wa\.me)/i.test(current.website) && <button type="button" className="primary" onClick={() => onResearch(current)}>Investigar a fondo</button>}
      </div>
    </article>
  );
}

const seconds = (ms) => `${(Number(ms || 0) / 1000).toFixed(1).replace('.', ',')} s`;

// Una línea para comparar la fuente (por ejemplo contra Google Maps).
export function searchSummary({ source = 'OpenStreetMap', zoneName, returned, withPhone, withWebsite, fresh, repeated, inCrm, ms, truncated }) {
  return `${zoneName} · ${source} devolvió ${returned} (${withPhone} con teléfono, ${withWebsite} con sitio web) · ${fresh} nuevos, ${repeated} repetidos${inCrm ? ` (${inCrm} ya están en tu CRM)` : ''} · ${seconds(ms)}.${truncated ? ' Había más: probá con otros rubros para ver el resto.' : ''}`;
}

export function SearchHistory({ searches, prospects, activeId, onShow, onDelete }) {
  const [confirming, setConfirming] = useState('');
  const rows = [...searches].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date))).slice(0, 30);
  if (!rows.length) return null;
  return (
    <details className="search-history" open={rows.length <= 3}>
      <summary>Historial de búsquedas ({searches.length})</summary>
      <div className="history-list">
        {rows.map((item) => {
          const found = prospects.filter((prospect) => prospect.searchId === item.id);
          const failed = item.status === 'error';
          return (
            <article key={item.id} className={`history-card ${failed ? 'failed' : ''} ${activeId === item.id ? 'active' : ''}`}>
              <div>
                <strong>{item.zoneName}</strong>
                <span className="muted small">{[item.province, item.family, item.date, item.source, item.ms != null ? seconds(item.ms) : ''].filter(Boolean).join(' · ')}</span>
                {Array.isArray(item.rubros) && item.rubros.length > 0 && <span className="muted small">Se buscó: {item.rubros.join(', ')}{item.radiusKm ? ` · radio de ${item.radiusKm} km` : ''}</span>}
                <span>
                  {failed ? <em className="badge warn">Error</em> : item.exhausted ? <em className="badge">Zona agotada por ahora</em> : <em className="badge ok">Ok</em>}
                  {' '}{failed ? item.error : `Devolvió ${item.returned ?? '–'} · ${item.withPhone ?? '–'} con teléfono · ${item.withWebsite ?? '–'} con web · ${item.fresh ?? item.found ?? 0} nuevos · ${item.repeated ?? '–'} repetidos`}
                </span>
                {!failed && item.returned === 0 && <span className="muted small">OpenStreetMap no devolvió comercios con esos rubros en esta zona: muchos comercios argentinos no están cargados ahí. Probá con otro rubro (ej. "ferretería") o una ciudad cercana más grande.</span>}
              </div>
              <div className="history-actions">
                {found.length > 0 && <button type="button" className="secondary" onClick={() => onShow(activeId === item.id ? null : item.id)}>{activeId === item.id ? 'Ver todos' : `Ver ${found.length} resultados`}</button>}
                {found.length > 0 && <button type="button" className="secondary" onClick={() => downloadCsv(found, `busqueda-${item.zoneName}-${item.date}`)}>CSV</button>}
                {confirming === item.id ? (
                  <>
                    <button type="button" className="secondary" onClick={() => { onDelete(item.id, false); setConfirming(''); }}>Quitar sólo la búsqueda</button>
                    {found.some((prospect) => prospect.state === 'No contactado' && !prospect.linkedClientId) && (
                      <button type="button" className="primary" onClick={() => { onDelete(item.id, true); setConfirming(''); }}>Borrar también sus no contactados</button>
                    )}
                    <button type="button" className="secondary" onClick={() => setConfirming('')}>Cancelar</button>
                  </>
                ) : (
                  <button type="button" className="secondary" aria-label={`Borrar búsqueda de ${item.zoneName}`} onClick={() => setConfirming(item.id)}><Trash2 size={14} /> Borrar</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}

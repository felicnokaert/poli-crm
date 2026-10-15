import { memo, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import {
  PROSPECT_FAMILIES, PROSPECT_OUTCOMES, PROSPECT_STATES, blankProspect, familyConfig,
  isCompetitor, possibleWhatsAppLink,
} from './prospect-model.mjs';
import { matchProspect } from './prospect-dedupe.mjs';
import { recordDeletions } from './workspace.mjs';
import { buildQueue, missingContact } from './prospect-queue.mjs';
import { contactQuality } from './prospect-contact.mjs';
import { applyResearch, companyFromTitle } from './prospect-research-apply.mjs';
import { markProspect } from './prospect-convert.mjs';
import { buildImportPlan, parseProspectsText } from './prospect-import.mjs';
import { AI_TOOLS, RESEARCH_COOLDOWN_DAYS, RESEARCH_MINUTES, buildResearchPrompt, exclusionNames } from './prospect-playbook.mjs';
import { readFileSmart } from './text-decode.mjs';
import { applyEnrichment } from './prospect-enrich-apply.mjs';
import { DAILY_TARGET, currentFocus, scopeDescription, zoneStatus, zonesForFamily } from './prospect-plan.mjs';

const DAILY_LIST_SIZE = 40;
const EMPTY = [];

function statusClass(status) {
  if (status === 'Nuevo') return 'badge ok';
  if (status === 'Posible duplicado') return 'badge warn';
  return 'badge';
}

function ProspectRow({ prospect, check, onMark, onOpenClient, onDelete, onEnrich }) {
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
  const head = ['Empresa', 'Familia', 'Rubro', 'Direccion', 'Localidad', 'Provincia', 'Telefono', 'Sitio web', 'Email', 'Instagram', 'Facebook', 'Estado', 'Fuente'];
  const lines = rows.map((item) => [item.company, item.family, item.rubro, item.address, item.city, item.province, item.phone, item.website, item.email, item.instagram, item.facebook, item.state, item.source].map(csvCell).join(';'));
  return `\ufeff${[head.map(csvCell).join(';'), ...lines].join('\r\n')}`;
}

function downloadCsv(rows, name = '') {
  const url = URL.createObjectURL(new Blob([prospectsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(name || `prospectos-${new Date().toISOString().slice(0, 10)}`).replace(/[^\p{L}\p{N}-]+/gu, '_')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// Planilla: los prospectos como filas, para recorrerlos rápido y marcar el estado en el momento.
function ProspectSheet({ rows, checks, onMark, onOpenClient, onDelete, onOpen }) {
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
function addToScope(scope = '', name = '') {
  if (!name) return scope;
  const parts = String(scope).split(',').map((part) => part.trim()).filter((part) => part && !/^todo el pa[ií]s$/i.test(part));
  return [...new Set([...parts, name])].join(', ');
}

const FICHA_FIELDS = [
  ['company', 'Empresa'], ['rubro', 'Rubro'], ['address', 'Dirección'], ['city', 'Localidad'], ['province', 'Provincia'],
  ['phone', 'Teléfono'], ['email', 'Mail'], ['website', 'Sitio web'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['contact', 'Persona de contacto'],
];

// Ficha del prospecto: todo lo que se sabe, editable, y desde dónde salió.
function ProspectDetail({ prospect, check, onClose, onSave, onMark, onEnrich, onOpenClient, onDelete }) {
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
function ResearchBox({ research }) {
  if (!research) return null;
  return (
    <div className="research-box">
      <p><strong>Investigación en la app:</strong> <em className={research.score >= 60 ? 'badge ok' : 'badge'}>{research.label} · {research.score}/100</em></p>
      <ul>{(research.reasoning || []).map((line, index) => <li key={index}>{line}</li>)}</ul>
      {(research.evidence || []).map((item, index) => (
        <blockquote key={index}>{item.snippet}{item.url && <> <a href={item.url} target="_blank" rel="noreferrer">fuente</a></>}</blockquote>
      ))}
    </div>
  );
}

function ProspectQueue({ queue, byId, checks, onMark, onSkip, onOpen, onEnrich, onResearch }) {
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
      <div className="panel-head-actions">
        <button type="button" className="primary big" onClick={() => { onMark(current.id, 'Contactado', ''); setOutcome(''); }}>Contactado</button>
        <button type="button" className="primary big" onClick={() => { onMark(current.id, 'Con interés', ''); setOutcome(''); }}>Con interés</button>
        <select aria-label="Motivo si no tiene interés" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
          <option value="">Motivo (opcional)</option>
          {PROSPECT_OUTCOMES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" className="secondary" onClick={() => { onMark(current.id, 'Sin interés', outcome); setOutcome(''); }}>Sin interés</button>
        <button type="button" className="secondary" onClick={() => onSkip(current.id)}>Saltar por hoy</button>
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

function SearchHistory({ searches, prospects, activeId, onShow, onDelete }) {
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

function ProspeccionBase({ data, setData, userEmail, onOpenClient, session, cities: citiesProp, provinces: provincesProp }) {
  const prospects = Array.isArray(data.prospects) ? data.prospects : EMPTY;
  const clients = Array.isArray(data.clients) ? data.clients : EMPTY;
  const switches = data.prospectSwitches || {};
  const [familyFilter, setFamilyFilter] = useState('Todas');
  const [stateFilter, setStateFilter] = useState('Todos');
  const [dailyList, setDailyList] = useState(null);
  const [listView, setListView] = useState('cola');
  const [searchFilter, setSearchFilter] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [skipped, setSkipped] = useState([]);
  const [research, setResearch] = useState({ family: '', scope: 'todo el país', count: 20, notes: '' });
  const [importJobId, setImportJobId] = useState(null);
  const [jobText, setJobText] = useState({});
  const researchJobs = Array.isArray(data.researchJobs) ? data.researchJobs : EMPTY;
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [form, setForm] = useState(null);
  const [cities, setCities] = useState(citiesProp || []);
  const [provinces, setProvinces] = useState(provincesProp || {});
  const focus = useMemo(() => currentFocus(new Date(), switches, data.prospectFocus), [switches, data.prospectFocus]);
  const [planFamily, setPlanFamily] = useState(focus.family);
  const [zone, setZone] = useState(null);
  const [provSel, setProvSel] = useState('');
  const [rubrosText, setRubrosText] = useState('');
  const [searching, setSearching] = useState(false);
  const [web, setWeb] = useState({ running: false, log: [], summary: '' });
  // Google Maps solo aparece si el servidor lo tiene activado (apagado por defecto).
  const [sources, setSources] = useState(['OpenStreetMap']);
  const [source, setSource] = useState('OpenStreetMap');
  useEffect(() => {
    if (!session?.access_token || typeof fetch !== 'function') return;
    fetch('/api/prospeccion', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sources' }) })
      .then((response) => response.json())
      .then((payload) => { if (Array.isArray(payload?.sources) && payload.sources.includes('OpenStreetMap')) setSources(payload.sources); })
      .catch(() => {});
  }, [session?.access_token]);
  const searches = Array.isArray(data.prospectSearches) ? data.prospectSearches : EMPTY;

  useEffect(() => {
    if (citiesProp || typeof fetch !== 'function') return undefined;
    let cancelled = false;
    Promise.all([
      fetch('/mapa/data/ciudades.json').then((response) => response.json()),
      fetch('/mapa/data/zonas.json').then((response) => response.json()),
    ]).then(([citiesFile, zonesFile]) => {
      if (cancelled) return;
      setCities(citiesFile.ciudades || []);
      setProvinces(Object.fromEntries((zonesFile.provincias || []).map((item) => [item.cod, item.nombre])));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [citiesProp]);

  useEffect(() => {
    setRubrosText((familyConfig(planFamily)?.rubros || []).join(', '));
    setZone(null);
  }, [planFamily]);

  const today = new Date().toISOString().slice(0, 10);
  // Zonas sugeridas por déficit de cobertura (habitantes por cliente/prospecto de la
  // familia); si la familia todavía no tiene datos, por población.
  const provinceCities = useMemo(() => (provSel ? cities.filter((item) => item.prov === provSel).sort((a, b) => b.pob - a.pob) : []), [provSel, cities]);
  const loadedToday = prospects.filter((item) => String(item.createdAt || '').slice(0, 10) === today && item.family === planFamily).length;

  const checks = useMemo(
    () => new Map(prospects.map((item) => [item.id, matchProspect(item, clients, prospects)])),
    [prospects, clients],
  );

  const visible = prospects.filter((item) => (familyFilter === 'Todas' || item.family === familyFilter) && (stateFilter === 'Todos' || item.state === stateFilter));

  function addProspects(rows, source) {
    const now = new Date().toISOString();
    const made = rows.map((row) => blankProspect({
      ...row,
      family: row.family && familyConfig(row.family) ? row.family : (familyFilter !== 'Todas' ? familyFilter : row.family || ''),
      source: row.source || source,
      competitor: isCompetitor(row.company),
    }, { id: crypto.randomUUID(), now }));
    setData((current) => ({ ...current, prospects: [...(Array.isArray(current.prospects) ? current.prospects : []), ...made] }));
    return made.length;
  }

  function submitForm(event) {
    event.preventDefault();
    if (!form.company.trim()) return;
    addProspects([{ ...form, company: form.company.trim() }], 'Carga manual');
    setForm(null);
    setMessage('Prospecto cargado.');
  }

  // Paso 1: leer la lista y mostrar la vista previa (todavía no se guarda nada).
  function analyzeImport(text, jobId = null) {
    setImportJobId(jobId);
    const { rows, ignored, error } = parseProspectsText(text);
    if (error) { setMessage(error); setImportPlan(null); return; }
    setImportPlan({ ...buildImportPlan(rows, clients, prospects), ignored });
    setMessage('');
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { analyzeImport(await readFileSmart(file)); } catch { setMessage('No se pudo leer el archivo. Probá guardarlo como CSV o pegá las filas.'); }
  }

  // Paso 2: confirmar. Entran las nuevas y las posibles duplicadas (con su etiqueta);
  // las que ya están en el CRM o ya cargadas se omiten.
  function confirmImport() {
    if (!importPlan) return;
    const job = researchJobs.find((item) => item.id === importJobId);
    const made = importPlan.toImport.map((item) => (job ? { ...item, family: item.family || job.family, researchJobId: job.id, source: 'Investigación IA' } : item));
    setData((current) => ({
      ...current,
      prospects: [...(Array.isArray(current.prospects) ? current.prospects : []), ...made],
      researchJobs: job ? (current.researchJobs || []).map((item) => (item.id === job.id ? { ...item, status: 'Importada', importedCount: made.length, updatedAt: new Date().toISOString() } : item)) : current.researchJobs,
    }));
    const skipped = importPlan.counts.enCrm + importPlan.counts.yaCargadas;
    setMessage(`Se importaron ${made.length} prospectos como "No contactado" (fuente: importado).${skipped ? ` Se omitieron ${skipped} que ya estaban en el CRM o ya cargadas.` : ''}`);
    setImportPlan(null);
    setImportText('');
    if (job) setJobText((current) => ({ ...current, [job.id]: '' }));
    setImportJobId(null);
  }

  function mark(prospectId, nextState, outcome) {
    let summary = '';
    setData((current) => {
      const { state, result } = markProspect(current, prospectId, nextState, { outcome, user: userEmail, newClientId: crypto.randomUUID() });
      summary = result;
      return state;
    });
    queueMicrotask(() => {
      if (summary === 'convertido') setMessage('Pasó a Empresas: ya podés seguirlo con las etapas del CRM.');
      else if (summary === 'vinculado') setMessage('Ya existía la empresa: se vinculó y se completaron solo los datos vacíos.');
    });
  }

  async function runSearch() {
    if (!zone || !session?.access_token) return;
    const rubros = rubrosText.split(',').map((item) => item.trim()).filter(Boolean);
    if (!rubros.length) { setMessage('Elegí al menos un rubro para buscar.'); return; }
    setSearching(true);
    setMessage('');
    const startedAt = Date.now();
    const base = { id: crypto.randomUUID(), family: planFamily, zoneId: zone.id, zoneName: zone.nombre, province: provinces[zone.prov] || '', date: new Date().toISOString().slice(0, 10), source, rubros };
    const logSearch = (entry) => setData((current) => ({ ...current, prospectSearches: [...(Array.isArray(current.prospectSearches) ? current.prospectSearches : []), { ...base, createdAt: new Date().toISOString(), ...entry }] }));
    try {
      const response = await fetch('/api/prospeccion', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: zone.lat, lon: zone.lon, population: zone.pob, source, zoneName: zone.nombre, province: provinces[zone.prov] || '', family: planFamily, rubros }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = payload.error || 'No se pudo hacer la búsqueda.';
        logSearch({ status: 'error', failed: true, found: 0, error: reason, ms: payload.ms ?? Date.now() - startedAt });
        setMessage(`${zone.nombre}: ${reason}`);
        return;
      }
      const known = new Set(prospects.flatMap((item) => [item.osmId, item.googleId]).filter(Boolean));
      const results = payload.results || [];
      const fresh = results.filter((item) => !known.has(item.osmId || item.googleId));
      const now = new Date().toISOString();
      const made = fresh.map((row) => blankProspect({ ...row, searchId: base.id, competitor: isCompetitor(row.company) }, { id: crypto.randomUUID(), now }));
      const inCrm = made.filter((item) => matchProspect(item, clients).status === 'Ya en el CRM').length;
      const stats = payload.stats || { returned: results.length, withPhone: results.filter((item) => item.phone).length, withWebsite: results.filter((item) => item.website).length };
      const ms = payload.ms ?? Date.now() - startedAt;
      setData((current) => ({
        ...current,
        prospects: [...(Array.isArray(current.prospects) ? current.prospects : []), ...made],
        prospectSearches: [...(Array.isArray(current.prospectSearches) ? current.prospectSearches : []), {
          ...base, createdAt: now, status: 'ok', found: made.length, returned: stats.returned, withPhone: stats.withPhone, withWebsite: stats.withWebsite,
          fresh: made.length, repeated: results.length - made.length, inCrm, ms, attempts: payload.attempts || 1, endpoint: payload.endpoint || '', radiusKm: payload.radiusKm ?? null, truncated: Boolean(payload.truncated),
        }],
      }));
      setMessage(searchSummary({ source, zoneName: zone.nombre, returned: stats.returned, withPhone: stats.withPhone, withWebsite: stats.withWebsite, fresh: made.length, repeated: results.length - made.length, inCrm, ms, truncated: payload.truncated }) + (payload.warning ? ` ${payload.warning}` : ''));
    } catch (error) {
      const reason = 'No se pudo hacer la búsqueda. Revisá tu conexión y probá de nuevo.';
      logSearch({ status: 'error', failed: true, found: 0, error: reason, ms: Date.now() - startedAt });
      setMessage(`${zone.nombre}: ${error?.message && !/fetch|network/i.test(error.message) ? error.message : reason}`);
    } finally {
      setSearching(false);
    }
  }

  async function api(body) {
    const response = await fetch('/api/prospeccion', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok && payload.ok !== false, payload };
  }

  async function researchProspect(prospect) {
    if (!session?.access_token) return 'Iniciá sesión para investigar.';
    try {
      const rubros = prospect.rubro ? [prospect.rubro] : [];
      const { ok, payload } = await api({ action: 'research', website: prospect.website, family: prospect.family || planFamily, rubros });
      if (!ok) return payload.error || 'No se pudo leer el sitio web.';
      const outcome = applyResearch(prospect, payload);
      setData((current) => ({ ...current, prospects: (current.prospects || []).map((item) => (item.id === prospect.id ? applyResearch(item, payload).prospect : item)) }));
      return `${prospect.company}: ${payload.label} (${payload.score}/100).${outcome.added.length ? ` Agregado: ${outcome.added.join(', ')}.` : ''}`;
    } catch {
      return 'No se pudo conectar para investigar. Probá de nuevo.';
    }
  }

  // Investigación en la app: busca páginas del rubro y la zona, lee cada sitio y
  // carga solo las que encajan, mostrando el razonamiento de cada una.
  async function runWebResearch() {
    if (!zone || !session?.access_token) return;
    const rubros = rubrosText.split(',').map((item) => item.trim()).filter(Boolean);
    if (!rubros.length) { setMessage('Elegí al menos un rubro para investigar.'); return; }
    const provinceName = provinces[zone.prov] || '';
    const searchId = crypto.randomUUID();
    setWeb({ running: true, log: [], summary: 'Buscando páginas de empresas en la web…' });
    try {
      const found = await api({ action: 'discover', rubros, city: zone.nombre, province: provinceName, family: planFamily });
      if (!found.ok) { setWeb({ running: false, log: [], summary: found.payload.error || 'No se pudo buscar en la web.' }); return; }
      const knownHosts = new Set([...prospects, ...clients].map((item) => String(item.website || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0]).filter(Boolean));
      const candidates = (found.payload.candidates || []).filter((item) => !knownHosts.has(item.host)).slice(0, 10);
      if (!candidates.length) {
        setWeb({ running: false, log: [], summary: found.payload.answered ? 'Los buscadores no devolvieron empresas nuevas para esta zona y rubros. Probá con otros rubros.' : 'Los buscadores web no respondieron (pueden estar bloqueando consultas automáticas). Probá más tarde o usá la búsqueda en OpenStreetMap.' });
        return;
      }
      const log = [];
      let added = 0;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        setWeb({ running: true, log: [...log], summary: `Leyendo sitio ${index + 1} de ${candidates.length}: ${candidate.host}` });
        const { ok, payload } = await api({ action: 'research', website: candidate.website, family: planFamily, rubros });
        if (!ok) { log.push({ host: candidate.host, title: candidate.title, status: 'No se pudo leer', reasoning: [payload.error || 'El sitio no respondió.'] }); continue; }
        const company = companyFromTitle(candidate.title, candidate.host);
        if (payload.score >= 30 && !payload.blockedByRobots) {
          const now = new Date().toISOString();
          const base = blankProspect({ company, family: planFamily, rubro: rubros[0], city: zone.nombre, province: provinceName, website: payload.website || candidate.website, source: 'Investigación en la app', searchId, competitor: isCompetitor(company) }, { id: crypto.randomUUID(), now });
          const made = applyResearch(base, payload, now).prospect;
          setData((current) => ({ ...current, prospects: [...(Array.isArray(current.prospects) ? current.prospects : []), made] }));
          added += 1;
          log.push({ host: candidate.host, title: company, status: `Cargada · ${payload.label} ${payload.score}/100`, reasoning: payload.reasoning });
        } else {
          log.push({ host: candidate.host, title: companyFromTitle(candidate.title, candidate.host), status: `Descartada · ${payload.label} ${payload.score}/100`, reasoning: payload.reasoning });
        }
      }
      const now = new Date().toISOString();
      setData((current) => ({ ...current, prospectSearches: [...(Array.isArray(current.prospectSearches) ? current.prospectSearches : []), { id: searchId, family: planFamily, zoneId: zone.id, zoneName: zone.nombre, province: provinceName, date: now.slice(0, 10), source: 'Investigación en la app', rubros, status: 'ok', found: added, returned: candidates.length, fresh: added, createdAt: now }] }));
      setWeb({ running: false, log, summary: `Investigación terminada en ${zone.nombre}: leí ${candidates.length} sitios y cargué ${added} que encajan.` });
    } catch {
      setWeb({ running: false, log: [], summary: 'Se cortó la investigación. Revisá tu conexión y probá de nuevo.' });
    }
  }

  function closeZone() {
    if (!zone) return;
    const now = new Date().toISOString();
    setData((current) => ({
      ...current,
      prospectSearches: [...(Array.isArray(current.prospectSearches) ? current.prospectSearches : []), {
        id: crypto.randomUUID(), family: planFamily, zoneId: zone.id, zoneName: zone.nombre, province: provinces[zone.prov] || '',
        date: now.slice(0, 10), found: 0, exhausted: true, source: 'Manual', createdAt: now,
      }],
    }));
    setMessage(`${zone.nombre} quedó como "agotada por ahora" para ${planFamily}: se vuelve a ofrecer en 60 días.`);
    setZone(null);
  }

  function prepareResearch() {
    const family = research.family || planFamily;
    if (!family) return;
    const now = new Date().toISOString();
    const exclusions = exclusionNames(clients, prospects);
    const job = {
      id: crypto.randomUUID(), family, scope: research.scope.trim() || 'todo el país', count: Number(research.count) || 20, notes: research.notes, status: 'Preparada', createdAt: now, updatedAt: now,
      prompt: buildResearchPrompt({ family, scope: research.scope.trim() || 'todo el país', count: Number(research.count) || 20, exclusions, notes: research.notes }),
    };
    setData((current) => ({ ...current, researchJobs: [...(Array.isArray(current.researchJobs) ? current.researchJobs : []), job] }));
    setMessage(`Pedido de investigación listo para ${family}. Copialo y lanzalo en la IA que prefieras (abajo).`);
  }

  function setJobStatus(jobId, status) {
    setData((current) => ({ ...current, researchJobs: (current.researchJobs || []).map((item) => (item.id === jobId ? { ...item, status, updatedAt: new Date().toISOString() } : item)) }));
  }

  async function copyPrompt(job) {
    try { await navigator.clipboard.writeText(job.prompt); setMessage('Pedido copiado. Pegalo en la IA y activá su modo de investigación avanzada.'); if (job.status === 'Preparada') setJobStatus(job.id, 'En curso'); } catch { setMessage('No se pudo copiar: abrí "Ver el pedido" y copialo a mano.'); }
  }

  function saveProspect(prospectId, fields) {
    const now = new Date().toISOString();
    setData((current) => ({ ...current, prospects: (current.prospects || []).map((item) => (item.id === prospectId ? { ...item, ...fields, id: item.id, updatedAt: now } : item)) }));
    setMessage('Cambios guardados en la ficha.');
  }

  function remove(prospectId) {
    setData((current) => recordDeletions({ ...current, prospects: (current.prospects || []).filter((item) => item.id !== prospectId) }, { prospects: [prospectId] }));
  }

  // Borra una búsqueda del historial; opcionalmente también los prospectos que trajo y siguen sin contactar.
  function deleteSearch(searchId, withProspects) {
    const doomed = withProspects ? prospects.filter((item) => item.searchId === searchId && item.state === 'No contactado' && !item.linkedClientId).map((item) => item.id) : [];
    setData((current) => recordDeletions({
      ...current,
      prospectSearches: (current.prospectSearches || []).filter((item) => item.id !== searchId),
      prospects: (current.prospects || []).filter((item) => !doomed.includes(item.id)),
    }, { prospectSearches: [searchId], prospects: doomed }));
    if (searchFilter === searchId) setSearchFilter(null);
    setMessage(doomed.length ? `Se borró la búsqueda y ${doomed.length} prospectos sin contactar.` : 'Se borró la búsqueda del historial.');
  }

  // Lee el sitio de la propia empresa (con robots.txt) y completa solo lo que falta.
  async function enrich(prospect) {
    if (!session?.access_token) return 'Iniciá sesión para buscar.';
    try {
      const response = await fetch('/api/prospeccion', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enrich', website: prospect.website }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) return result.error || 'No se pudo leer el sitio web.';
      if (result.blockedByRobots) return 'El sitio pide no ser leído por robots (robots.txt): no se leyó.';
      const outcome = applyEnrichment(prospect, result);
      if (!outcome.added.length) return 'Se leyó el sitio y no había datos nuevos para agregar.';
      setData((current) => ({ ...current, prospects: (current.prospects || []).map((item) => (item.id === prospect.id ? applyEnrichment(item, result).prospect : item)) }));
      return `Agregado desde su sitio: ${outcome.added.join(', ')}.`;
    } catch {
      return 'No se pudo conectar para leer el sitio. Probá de nuevo.';
    }
  }

  function buildDailyList() {
    const eligible = prospects
      .filter((item) => item.state === 'No contactado' && !item.competitor && checks.get(item.id)?.status === 'Nuevo')
      .sort((a, b) => (Number(Boolean(b.phone)) + Number(Boolean(b.website))) - (Number(Boolean(a.phone)) + Number(Boolean(a.website))))
      .slice(0, DAILY_LIST_SIZE);
    setDailyList(eligible.map((item) => item.id));
  }

  const coverage = useMemo(() => {
    const table = new Map();
    for (const item of prospects) {
      const key = `${item.family || 'Sin familia'}|${item.city || 'Sin localidad'}`;
      const row = table.get(key) || { family: item.family || 'Sin familia', city: item.city || 'Sin localidad', total: 0, contacted: 0, interested: 0 };
      row.total += 1;
      if (item.state !== 'No contactado') row.contacted += 1;
      if (item.state === 'Con interés') row.interested += 1;
      table.set(key, row);
    }
    return [...table.values()].sort((a, b) => b.total - a.total).slice(0, 30);
  }, [prospects]);

  const bySearch = searchFilter ? visible.filter((item) => item.searchId === searchFilter) : visible;
  const prospectsById = useMemo(() => new Map(prospects.map((item) => [item.id, item])), [prospects]);
  const shown = dailyList ? bySearch.filter((item) => dailyList.includes(item.id)) : bySearch;

  const importPreview = importPlan && (
    <div className="panel">
      <h3>Vista previa de la importación</h3>
      <p>
        {importPlan.counts.total} filas: <strong>{importPlan.counts.nuevas} nuevas</strong>, {importPlan.counts.enCrm} ya en el CRM,
        {' '}{importPlan.counts.posibles} posibles duplicadas, {importPlan.counts.yaCargadas} ya cargadas como prospecto
        {importPlan.ignored ? `, ${importPlan.ignored} sin nombre (se ignoran)` : ''}.
      </p>
      <table>
        <thead><tr><th>Empresa</th><th>Familia</th><th>Ciudad</th><th>Cruce</th></tr></thead>
        <tbody>
          {importPlan.items.slice(0, 15).map((item) => (
            <tr key={item.prospect.id}>
              <td>{item.prospect.company}</td><td>{item.prospect.family || item.prospect.imported?.familyRaw || '–'}</td><td>{item.prospect.city || '–'}</td>
              <td>{item.status}{item.match ? ` · ${item.match.name}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {importPlan.items.length > 15 && <p className="muted">Se muestran las primeras 15 de {importPlan.items.length}.</p>}
      <div className="panel-head-actions">
        <button type="button" className="primary" disabled={!importPlan.toImport.length} onClick={confirmImport}>Confirmar importación ({importPlan.toImport.length})</button>
        <button type="button" className="secondary" onClick={() => setImportPlan(null)}>Cancelar</button>
      </div>
    </div>
  );

  const queue = buildQueue(bySearch, checks, { skipped });
  const detail = detailId ? prospectsById.get(detailId) : null;

  return (
    <section className="panel prospect-glass">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Cartera</span>
          <h2>Prospección</h2>
          <p>Empresas que todavía no son clientes. Al marcar un prospecto como Contactado o Con interés pasa a Empresas y desde ahí rige toda la lógica del CRM. Nunca se envían mensajes desde acá: el contacto es siempre manual.</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="primary" onClick={() => setForm(blankProspect({ family: familyFilter !== 'Todas' ? familyFilter : '' }))}><Plus size={16} /> Cargar prospecto</button>
        </div>
      </div>

      <details className="panel research-panel">
        <summary><strong>Opcional: investigación con tu propia IA (Claude, ChatGPT, Gemini)</strong></summary>
        <div className="prospect-search-head">
          <div>
            <h3>Investigación con IA externa</h3>
            <p className="muted">La búsqueda de verdad: una IA con modo de investigación avanzada recorre Google, Maps, sitios y redes y devuelve una tabla con evidencia y fuente por empresa. Tarda entre {RESEARCH_MINUTES.min} y {RESEARCH_MINUTES.max} minutos y no cuesta nada extra: usa tu suscripción a Claude, ChatGPT, Gemini o Perplexity. El CRM arma el pedido (con las empresas que ya tenés excluidas) y después importa el resultado.</p>
          </div>
        </div>
        <div className="research-form">
          <label>Familia
            <select aria-label="Familia a investigar" value={research.family || planFamily} onChange={(event) => setResearch({ ...research, family: event.target.value })}>
              {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
            </select>
          </label>
          <label>Alcance
            <input aria-label="Alcance de la investigación" value={research.scope} onChange={(event) => setResearch({ ...research, scope: event.target.value })} placeholder="todo el país, o provincias y localidades" />
          </label>
          <div className="scope-picker">
            <label>Sumar provincia
              <select aria-label="Agregar provincia al alcance" value={research.scopeProv || ''} onChange={(event) => setResearch({ ...research, scopeProv: event.target.value, scope: addToScope(research.scope, provinces[event.target.value]) })}>
                <option value="">Agregar una provincia</option>
                {Object.entries(provinces).sort((x, y) => x[1].localeCompare(y[1], 'es')).map(([cod, name]) => <option key={cod} value={cod}>{name}</option>)}
              </select>
            </label>
            <label>Sumar localidad
              <select aria-label="Agregar localidad al alcance" disabled={!research.scopeProv} value="" onChange={(event) => setResearch({ ...research, scope: addToScope(research.scope, event.target.value) })}>
                <option value="">{research.scopeProv ? 'Agregar una localidad' : 'Primero la provincia'}</option>
                {cities.filter((item) => item.prov === research.scopeProv).sort((x, y) => y.pob - x.pob).map((item) => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
              </select>
            </label>
            <button type="button" className="secondary" onClick={() => setResearch({ ...research, scope: 'todo el país', scopeProv: '' })}>Todo el país</button>
          </div>
          <label>Cantidad
            <input type="number" min="5" max="50" value={research.count} onChange={(event) => setResearch({ ...research, count: event.target.value })} />
          </label>
          <label className="research-notes">Indicaciones extra (opcional)
            <input value={research.notes} onChange={(event) => setResearch({ ...research, notes: event.target.value })} placeholder="ej. priorizar empresas con planta propia" />
          </label>
        </div>
        <div className="prospect-search-actions">
          <button type="button" className="primary big" onClick={prepareResearch}><Search size={18} /> Preparar investigación</button>
          <span className="muted small">Se excluyen {exclusionNames(clients, prospects).length} empresas que ya tenés.</span>
        </div>

        {researchJobs.length > 0 && (
          <div className="history-list">
            {[...researchJobs].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((job) => {
              const again = new Date(new Date(job.createdAt).getTime() + RESEARCH_COOLDOWN_DAYS * 86400000).toISOString().slice(0, 10);
              return (
                <article key={job.id} className="history-card research-job">
                  <div>
                    <strong>{job.family} · {job.scope}</strong>
                    <span className="muted small">{job.createdAt.slice(0, 10)} · hasta {job.count} empresas · volver a investigar esto a partir del {again}</span>
                    <span>
                      <em className={job.status === 'Importada' ? 'badge ok' : 'badge'}>{job.status}</em>
                      {job.status === 'Importada' && ` · ${job.importedCount ?? 0} prospectos cargados`}
                      {job.status === 'En curso' && ` · la IA tarda entre ${RESEARCH_MINUTES.min} y ${RESEARCH_MINUTES.max} minutos; cuando termine, pegá la tabla acá abajo`}
                    </span>
                    <div className="panel-head-actions">
                      <button type="button" className="primary" onClick={() => copyPrompt(job)}>Copiar pedido</button>
                      {AI_TOOLS.map((tool) => <a key={tool.name} className="secondary link-pill" href={tool.url} target="_blank" rel="noreferrer">Abrir {tool.name} ({tool.note})</a>)}
                    </div>
                    <details>
                      <summary>Ver el pedido</summary>
                      <textarea readOnly rows={10} value={job.prompt} aria-label={`Pedido de ${job.family}`} />
                    </details>
                    {job.status !== 'Importada' && (
                      <details open={job.status === 'En curso'}>
                        <summary>Pegar el resultado de la IA</summary>
                        <textarea rows={6} placeholder="Pegá acá la tabla (o el CSV) que te devolvió la IA" aria-label={`Resultado de ${job.family}`} value={jobText[job.id] || ''} onChange={(event) => setJobText({ ...jobText, [job.id]: event.target.value })} />
                        <button type="button" className="secondary" disabled={!(jobText[job.id] || '').trim()} onClick={() => { setJobStatus(job.id, 'Resultado listo'); analyzeImport(jobText[job.id], job.id); }}>Revisar resultado</button>
                      </details>
                    )}
                    {importPlan && importJobId === job.id && importPreview}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </details>

      <div className="panel prospect-search">
        <div className="prospect-search-head">
          <div>
            <h3>Plan de hoy · búsqueda rápida en OpenStreetMap</h3>
            <p className="muted">Una familia por día, zona por zona sin repetir. Meta: {DAILY_TARGET.min} a {DAILY_TARGET.max} contactos nuevos por día (hoy cargaste {loadedToday} de {planFamily || 'esta familia'}).</p>
          </div>
        </div>

        <ol className="prospect-steps">
          <li>
            <span className="step-title">1 · Familia</span>
            <label className="sr-only-label">Familia de hoy
              <select aria-label="Familia de hoy" value={planFamily} onChange={(event) => setPlanFamily(event.target.value)}>
                {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
              </select>
            </label>
            <span className="muted small">Alcance: {scopeDescription(planFamily)}</span>
          </li>
          <li>
            <span className="step-title">2 · Zona</span>
            <div className="zone-pickers">
              <label>Provincia
                <select aria-label="Provincia" value={provSel} onChange={(event) => { setProvSel(event.target.value); setZone(null); }}>
                  <option value="">Elegí una provincia</option>
                  {Object.entries(provinces).sort((x, y) => x[1].localeCompare(y[1], 'es')).map(([cod, name]) => <option key={cod} value={cod}>{name}</option>)}
                </select>
              </label>
              <label>Ciudad
                <select aria-label="Ciudad" value={zone && zone.prov === provSel ? zone.id : ''} disabled={!provSel} onChange={(event) => setZone(provinceCities.find((item) => item.id === event.target.value) || null)}>
                  <option value="">{provSel ? 'Elegí una ciudad' : 'Primero la provincia'}</option>
                  {provinceCities.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </label>
            </div>
            {cities.length === 0 && <span className="muted">Cargando zonas…</span>}
            {zone && <p className="zone-picked"><strong>{zone.nombre}</strong>{provinces[zone.prov] ? `, ${provinces[zone.prov]}` : ''} · {zoneStatus(planFamily, zone.id, searches, today).status}</p>}
          </li>
          <li>
            <span className="step-title">3 · Qué buscar</span>
            <label>Rubros a buscar (separados por coma)
              <input value={rubrosText} onChange={(event) => setRubrosText(event.target.value)} />
            </label>
            {sources.length > 1 && (
              <label>Fuente
                <select aria-label="Fuente de la búsqueda" value={source} onChange={(event) => setSource(event.target.value)}>
                  {sources.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            )}
          </li>
        </ol>

        <div className="prospect-search-actions">
          <button type="button" className="primary big" disabled={!zone || searching || !session?.access_token} onClick={runSearch}>
            <Search size={18} /> {searching ? 'Buscando… puede tardar hasta 1 minuto' : zone ? `Buscar en ${zone.nombre}` : 'Elegí una zona'}
          </button>
          <button type="button" className="primary big" disabled={!zone || web.running || !session?.access_token} onClick={runWebResearch}>
            <Search size={18} /> {web.running ? 'Investigando…' : 'Investigar en la web (en la app)'}
          </button>
          <button type="button" className="secondary" disabled={!zone} onClick={closeZone}>Terminé esta zona (por ahora)</button>
        </div>
        {(web.running || web.summary) && (
          <div className="web-research" role="status" aria-live="polite">
            <p><strong>{web.summary}</strong></p>
            {web.log.map((entry) => (
              <details key={entry.host}>
                <summary>{entry.title} <span className="muted small">({entry.host})</span> · {entry.status}</summary>
                <ul>{(entry.reasoning || []).map((line, index) => <li key={index}>{line}</li>)}</ul>
              </details>
            ))}
          </div>
        )}
        {searching && (
          <div className="search-progress" role="status" aria-live="polite">
            <span className="bar" />
            <p>Buscando en OpenStreetMap{zone ? ` (${zone.nombre})` : ''}… puede tardar hasta 1 minuto. Podés seguir usando el CRM; el resultado aparece acá y en el historial. Esta zona vuelve a estar disponible en {60} días.</p>
          </div>
        )}

      </div>
      {message && <div className="system-message">{message}</div>}

      {form && (
        <form className="form-grid" onSubmit={submitForm}>
          <label>Empresa<input required value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
          <label>Familia
            <select value={form.family} onChange={(event) => setForm({ ...form, family: event.target.value })}>
              <option value="">Sin definir</option>
              {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
            </select>
          </label>
          <label>Rubro<input value={form.rubro} onChange={(event) => setForm({ ...form, rubro: event.target.value })} /></label>
          <label>Localidad<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
          <label>Provincia<input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></label>
          <label>Teléfono<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Sitio web<input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></label>
          <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <div className="panel-head-actions span-2">
            <button type="submit" className="primary">Guardar prospecto</button>
            <button type="button" className="secondary" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <details>
        <summary><FileUp size={14} /> Importar o pegar una lista de prospectos</summary>
        <p className="muted">Subí un CSV o pegá las filas copiadas de la planilla, con los encabezados en la primera fila (Nombre empresa, Familia, Subfamilia, provincia, ciudad, Maquina, Proveedor, telefono, email, Estado, Comercial, Contacto, observaciones, Fecha de seguimiento, Tipo entidad, Producto / propuesta, Estado comercial, Valor potencial, Próxima acción, Fecha próxima acción). Antes de guardar vas a ver cuántas son nuevas, cuántas ya están en el CRM y cuántas son posibles duplicadas.</p>
        <label className="secondary upload-button"><FileUp size={14} /> Elegir un CSV
          <input type="file" accept=".csv,.txt,text/csv" hidden aria-label="Archivo de prospectos" onChange={importFile} />
        </label>
        <textarea rows={5} value={importText} onChange={(event) => setImportText(event.target.value)} aria-label="Lista de prospectos" />
        <button type="button" className="secondary" disabled={!importText.trim()} onClick={() => analyzeImport(importText)}>Revisar lista</button>
        {importPlan && !importJobId && importPreview}
      </details>

      <div className="panel-head-actions">
        <select aria-label="Familia" value={familyFilter} onChange={(event) => { setFamilyFilter(event.target.value); setDailyList(null); }}>
          <option>Todas</option>
          {PROSPECT_FAMILIES.map((item) => <option key={item.key}>{item.key}</option>)}
        </select>
        <select aria-label="Estado" value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setDailyList(null); }}>
          <option>Todos</option>
          {PROSPECT_STATES.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" className="secondary" onClick={buildDailyList}>Generar mi lista del día</button>
        {dailyList && <button type="button" className="link-button" onClick={() => setDailyList(null)}>Ver todos</button>}
      </div>
      {dailyList && <p className="form-notice">Lista del día: {dailyList.length} prospectos nuevos, sin duplicados, de familias activas y con más datos de contacto primero.</p>}

      <div className="panel-head-actions">
        <div className="segmented" role="tablist" aria-label="Vista de la lista">
          <button type="button" role="tab" aria-selected={listView === 'cola'} className={listView === 'cola' ? 'selected' : ''} onClick={() => setListView('cola')}>Cola de trabajo</button>
          <button type="button" role="tab" aria-selected={listView === 'planilla'} className={listView === 'planilla' ? 'selected' : ''} onClick={() => setListView('planilla')}>Planilla</button>
          <button type="button" role="tab" aria-selected={listView === 'tarjetas'} className={listView === 'tarjetas' ? 'selected' : ''} onClick={() => setListView('tarjetas')}>Tarjetas</button>
        </div>
        <button type="button" className="secondary" disabled={!shown.length} onClick={() => downloadCsv(shown)}>Descargar CSV ({shown.length})</button>
      </div>
      {listView === 'cola' && <ProspectQueue queue={queue} byId={prospectsById} checks={checks} onMark={mark} onSkip={(id) => setSkipped((list) => [...list, id])} onOpen={setDetailId} onEnrich={async (prospect) => setMessage(await enrich(prospect))} onResearch={async (prospect) => setMessage(await researchProspect(prospect))} />}
      {listView !== 'cola' && shown.length === 0 && <p className="muted">{prospects.length ? 'No hay prospectos con ese filtro.' : 'Todavía no cargaste prospectos.'}</p>}
      {listView === 'planilla' && shown.length > 0 && <ProspectSheet rows={shown} checks={checks} onMark={mark} onOpenClient={onOpenClient} onDelete={remove} onOpen={setDetailId} />}
      {listView === 'tarjetas' && (
        <div className="units-list">
          {shown.map((item) => (
            <ProspectRow key={item.id} prospect={item} check={checks.get(item.id) || { status: 'Nuevo', matches: [] }} onMark={mark} onOpenClient={onOpenClient} onDelete={remove} onEnrich={enrich} />
          ))}
        </div>
      )}

      <SearchHistory searches={searches} prospects={prospects} activeId={searchFilter} onShow={setSearchFilter} onDelete={deleteSearch} />

      {coverage.length > 0 && (
        <>
          <h3>Cobertura por familia y localidad</h3>
          <table>
            <thead><tr><th>Familia</th><th>Localidad</th><th>Cargados</th><th>Contactados</th><th>Con interés</th></tr></thead>
            <tbody>
              {coverage.map((row) => (
                <tr key={`${row.family}|${row.city}`}><td>{row.family}</td><td>{row.city}</td><td>{row.total}</td><td>{row.contacted}</td><td>{row.interested}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {detail && (
        <ProspectDetail
          key={detail.id} prospect={detail} check={checks.get(detail.id) || { status: 'Nuevo', matches: [] }}
          onClose={() => setDetailId(null)} onSave={saveProspect} onMark={mark} onOpenClient={onOpenClient} onDelete={remove}
          onEnrich={async (prospect) => setMessage(await enrich(prospect))}
        />
      )}
    </section>
  );
}

export const Prospeccion = memo(ProspeccionBase);

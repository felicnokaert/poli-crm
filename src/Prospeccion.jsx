import { memo, useMemo, useState } from 'react';
import { ExternalLink, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import {
  PROSPECT_FAMILIES, PROSPECT_OUTCOMES, PROSPECT_STATES, blankProspect, familyConfig, familyIsActive,
  isCompetitor, possibleWhatsAppLink,
} from './prospect-model.mjs';
import { matchProspect } from './prospect-dedupe.mjs';
import { markProspect } from './prospect-convert.mjs';
import { parseProspectsText } from './prospect-import.mjs';

const DAILY_LIST_SIZE = 40;
const EMPTY = [];

function statusClass(status) {
  if (status === 'Nuevo') return 'badge ok';
  if (status === 'Posible duplicado') return 'badge warn';
  return 'badge';
}

function ProspectRow({ prospect, check, onMark, onOpenClient, onDelete }) {
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
        </span>
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
        <button type="button" className="icon-button" aria-label="Eliminar prospecto" onClick={() => onDelete(prospect.id)}><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

function ProspeccionBase({ data, setData, userEmail, onOpenClient }) {
  const prospects = Array.isArray(data.prospects) ? data.prospects : EMPTY;
  const clients = Array.isArray(data.clients) ? data.clients : EMPTY;
  const switches = data.prospectSwitches || {};
  const [familyFilter, setFamilyFilter] = useState('Todas');
  const [stateFilter, setStateFilter] = useState('Todos');
  const [dailyList, setDailyList] = useState(null);
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const [form, setForm] = useState(null);

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

  function submitImport() {
    const { rows, ignored, error } = parseProspectsText(importText);
    if (error) { setMessage(error); return; }
    const added = addProspects(rows, 'Importación');
    setImportText('');
    setMessage(`Se cargaron ${added} prospectos${ignored ? ` (${ignored} filas sin nombre se ignoraron)` : ''}. Revisá las etiquetas de duplicado antes de contactar.`);
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

  function remove(prospectId) {
    setData((current) => ({ ...current, prospects: (current.prospects || []).filter((item) => item.id !== prospectId) }));
  }

  function toggleFamily(key) {
    setData((current) => ({ ...current, prospectSwitches: { ...(current.prospectSwitches || {}), [key]: !familyIsActive(key, current.prospectSwitches) } }));
  }

  function buildDailyList() {
    const eligible = prospects
      .filter((item) => item.state === 'No contactado' && !item.competitor && checks.get(item.id)?.status === 'Nuevo' && familyIsActive(item.family, switches))
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

  const shown = dailyList ? visible.filter((item) => dailyList.includes(item.id)) : visible;

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Cartera</span>
          <h2>Prospección</h2>
          <p>Empresas que todavía no son clientes. Al marcar un prospecto como Contactado o Con interés pasa a Empresas y desde ahí rige toda la lógica del CRM. Nunca se envían mensajes desde acá: el contacto es siempre manual.</p>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="secondary" disabled title="Pendiente: la búsqueda automática necesita acceso a OpenStreetMap desde el servidor"><Search size={16} /> Buscar (próximamente)</button>
          <button type="button" className="primary" onClick={() => setForm(blankProspect({ family: familyFilter !== 'Todas' ? familyFilter : '' }))}><Plus size={16} /> Cargar prospecto</button>
        </div>
      </div>
      <p className="form-notice">La búsqueda automática todavía no está activa. Mientras tanto podés cargar prospectos a mano o pegar una lista (por ejemplo la hoja RELEVAMIENTO).</p>
      {message && <div className="system-message">{message}</div>}

      <div className="units-list">
        {PROSPECT_FAMILIES.map((family) => (
          <label key={family.key} className="checkbox-field">
            <input type="checkbox" checked={familyIsActive(family.key, switches)} onChange={() => toggleFamily(family.key)} />
            {family.key}{familyIsActive(family.key, switches) ? '' : ' (pausada)'}
          </label>
        ))}
      </div>

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
        <summary><FileUp size={14} /> Pegar una lista de prospectos</summary>
        <p className="muted">Pegá la tabla con encabezados en la primera fila (Empresa, Teléfono, Sitio web, Localidad, Provincia, Familia, Rubro…).</p>
        <textarea rows={5} value={importText} onChange={(event) => setImportText(event.target.value)} aria-label="Lista de prospectos" />
        <button type="button" className="secondary" disabled={!importText.trim()} onClick={submitImport}>Cargar la lista</button>
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

      <div className="units-list">
        {shown.length === 0 && <p className="muted">{prospects.length ? 'No hay prospectos con ese filtro.' : 'Todavía no cargaste prospectos.'}</p>}
        {shown.map((item) => (
          <ProspectRow key={item.id} prospect={item} check={checks.get(item.id) || { status: 'Nuevo', matches: [] }} onMark={mark} onOpenClient={onOpenClient} onDelete={remove} />
        ))}
      </div>

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
    </section>
  );
}

export const Prospeccion = memo(ProspeccionBase);

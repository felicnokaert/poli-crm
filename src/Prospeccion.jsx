import { memo, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import {
  PROSPECT_FAMILIES, PROSPECT_OUTCOMES, PROSPECT_STATES, blankProspect, familyConfig, familyIsActive,
  isCompetitor, possibleWhatsAppLink,
} from './prospect-model.mjs';
import { matchProspect } from './prospect-dedupe.mjs';
import { markProspect } from './prospect-convert.mjs';
import { buildImportPlan, parseProspectsText } from './prospect-import.mjs';
import { readFileSmart } from './text-decode.mjs';
import { deficitRanking, familyPoints } from './prospect-coverage.mjs';
import { DAILY_TARGET, currentFocus, scopeDescription, weekStart, suggestZones, zoneStatus, zonesForFamily } from './prospect-plan.mjs';

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

const seconds = (ms) => `${(Number(ms || 0) / 1000).toFixed(1).replace('.', ',')} s`;

// Una línea para comparar la fuente (por ejemplo contra Google Maps).
export function searchSummary({ zoneName, returned, withPhone, withWebsite, fresh, repeated, inCrm, ms, truncated }) {
  return `${zoneName} · OpenStreetMap devolvió ${returned} (${withPhone} con teléfono, ${withWebsite} con sitio web) · ${fresh} nuevos, ${repeated} repetidos${inCrm ? ` (${inCrm} ya están en tu CRM)` : ''} · ${seconds(ms)}.${truncated ? ' Había más: probá con otros rubros para ver el resto.' : ''}`;
}

function SearchHistory({ searches }) {
  const rows = [...searches].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date))).slice(0, 20);
  if (!rows.length) return null;
  return (
    <details>
      <summary>Historial de búsquedas ({searches.length})</summary>
      <table>
        <thead><tr><th>Fecha</th><th>Familia</th><th>Zona</th><th>Fuente</th><th>Devolvió</th><th>Con teléfono</th><th>Con web</th><th>Nuevos</th><th>Repetidos</th><th>Tiempo</th><th>Resultado</th></tr></thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>{item.date}</td><td>{item.family}</td><td>{item.zoneName}</td><td>{item.source}</td>
              <td>{item.returned ?? '–'}</td><td>{item.withPhone ?? '–'}</td><td>{item.withWebsite ?? '–'}</td>
              <td>{item.fresh ?? item.found ?? '–'}</td><td>{item.repeated ?? '–'}</td><td>{item.ms != null ? seconds(item.ms) : '–'}</td>
              <td>{item.status === 'error' ? `Error: ${item.error}` : item.exhausted ? 'Zona agotada por ahora' : 'Ok'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ProspeccionBase({ data, setData, userEmail, onOpenClient, session, cities: citiesProp }) {
  const prospects = Array.isArray(data.prospects) ? data.prospects : EMPTY;
  const clients = Array.isArray(data.clients) ? data.clients : EMPTY;
  const switches = data.prospectSwitches || {};
  const [familyFilter, setFamilyFilter] = useState('Todas');
  const [stateFilter, setStateFilter] = useState('Todos');
  const [dailyList, setDailyList] = useState(null);
  const [message, setMessage] = useState('');
  const [importText, setImportText] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [form, setForm] = useState(null);
  const [cities, setCities] = useState(citiesProp || []);
  const [provinces, setProvinces] = useState({});
  const focus = useMemo(() => currentFocus(new Date(), switches, data.prospectFocus), [switches, data.prospectFocus]);
  const [planFamily, setPlanFamily] = useState(focus.family);
  const [zone, setZone] = useState(null);
  const [zoneQuery, setZoneQuery] = useState('');
  const [rubrosText, setRubrosText] = useState('');
  const [searching, setSearching] = useState(false);
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
    if (!familyIsActive(planFamily, switches) && focus.family) setPlanFamily(focus.family);
  }, [planFamily, switches, focus.family]);

  useEffect(() => {
    setRubrosText((familyConfig(planFamily)?.rubros || []).join(', '));
    setZone(null);
  }, [planFamily]);

  const today = new Date().toISOString().slice(0, 10);
  // Zonas sugeridas por déficit de cobertura (habitantes por cliente/prospecto de la
  // familia); si la familia todavía no tiene datos, por población.
  const ranking = useMemo(() => {
    if (!planFamily || !cities.length) return null;
    const points = familyPoints(planFamily, { clients, prospects, cities, provinces });
    return points.length ? deficitRanking(planFamily, cities, points) : null;
  }, [planFamily, cities, clients, prospects, provinces]);
  const suggestions = useMemo(() => (planFamily && cities.length ? suggestZones(planFamily, cities, searches, { count: 3, today, ranking }) : []), [planFamily, cities, searches, today, ranking]);
  const zoneMatches = useMemo(() => {
    const query = zoneQuery.trim().toLocaleLowerCase('es-AR');
    if (query.length < 3) return [];
    return zonesForFamily(planFamily, cities).filter((item) => item.nombre.toLocaleLowerCase('es-AR').includes(query)).slice(0, 6);
  }, [zoneQuery, planFamily, cities]);
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
  function analyzeImport(text) {
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
    const made = importPlan.toImport;
    setData((current) => ({ ...current, prospects: [...(Array.isArray(current.prospects) ? current.prospects : []), ...made] }));
    const skipped = importPlan.counts.enCrm + importPlan.counts.yaCargadas;
    setMessage(`Se importaron ${made.length} prospectos como "No contactado" (fuente: importado).${skipped ? ` Se omitieron ${skipped} que ya estaban en el CRM o ya cargadas.` : ''}`);
    setImportPlan(null);
    setImportText('');
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
    const base = { id: crypto.randomUUID(), family: planFamily, zoneId: zone.id, zoneName: zone.nombre, province: provinces[zone.prov] || '', date: new Date().toISOString().slice(0, 10), source: 'OpenStreetMap' };
    const logSearch = (entry) => setData((current) => ({ ...current, prospectSearches: [...(Array.isArray(current.prospectSearches) ? current.prospectSearches : []), { ...base, createdAt: new Date().toISOString(), ...entry }] }));
    try {
      const response = await fetch('/api/prospeccion', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: zone.lat, lon: zone.lon, population: zone.pob, zoneName: zone.nombre, province: provinces[zone.prov] || '', family: planFamily, rubros }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const reason = payload.error || 'No se pudo hacer la búsqueda.';
        logSearch({ status: 'error', failed: true, found: 0, error: reason, ms: payload.ms ?? Date.now() - startedAt });
        setMessage(`${zone.nombre}: ${reason}`);
        return;
      }
      const known = new Set(prospects.map((item) => item.osmId).filter(Boolean));
      const results = payload.results || [];
      const fresh = results.filter((item) => !known.has(item.osmId));
      const now = new Date().toISOString();
      const made = fresh.map((row) => blankProspect({ ...row, competitor: isCompetitor(row.company) }, { id: crypto.randomUUID(), now }));
      const inCrm = made.filter((item) => matchProspect(item, clients).status === 'Ya en el CRM').length;
      const stats = payload.stats || { returned: results.length, withPhone: results.filter((item) => item.phone).length, withWebsite: results.filter((item) => item.website).length };
      const ms = payload.ms ?? Date.now() - startedAt;
      setData((current) => ({
        ...current,
        prospects: [...(Array.isArray(current.prospects) ? current.prospects : []), ...made],
        prospectSearches: [...(Array.isArray(current.prospectSearches) ? current.prospectSearches : []), {
          ...base, createdAt: now, status: 'ok', found: made.length, returned: stats.returned, withPhone: stats.withPhone, withWebsite: stats.withWebsite,
          fresh: made.length, repeated: results.length - made.length, inCrm, ms, attempts: payload.attempts || 1, endpoint: payload.endpoint || '', truncated: Boolean(payload.truncated),
        }],
      }));
      setMessage(searchSummary({ zoneName: zone.nombre, returned: stats.returned, withPhone: stats.withPhone, withWebsite: stats.withWebsite, fresh: made.length, repeated: results.length - made.length, inCrm, ms, truncated: payload.truncated }));
    } catch (error) {
      const reason = 'No se pudo hacer la búsqueda. Revisá tu conexión y probá de nuevo.';
      logSearch({ status: 'error', failed: true, found: 0, error: reason, ms: Date.now() - startedAt });
      setMessage(`${zone.nombre}: ${error?.message && !/fetch|network/i.test(error.message) ? error.message : reason}`);
    } finally {
      setSearching(false);
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

  function remove(prospectId) {
    setData((current) => ({ ...current, prospects: (current.prospects || []).filter((item) => item.id !== prospectId) }));
  }

  function toggleFamily(key) {
    setData((current) => ({ ...current, prospectSwitches: { ...(current.prospectSwitches || {}), [key]: !familyIsActive(key, current.prospectSwitches) } }));
  }

  function setFocus(family) {
    setData((current) => ({ ...current, prospectFocus: family ? { family, weekStart: weekStart(new Date()) } : null }));
    if (family) setPlanFamily(family);
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
          <button type="button" className="primary" onClick={() => setForm(blankProspect({ family: familyFilter !== 'Todas' ? familyFilter : '' }))}><Plus size={16} /> Cargar prospecto</button>
        </div>
      </div>

      <div className="panel">
        <h3>Plan de hoy</h3>
        <p className="muted">Una familia por día, recorriendo el país zona por zona sin repetir. Meta: entre {DAILY_TARGET.min} y {DAILY_TARGET.max} contactos nuevos por día (hoy cargaste {loadedToday} de {planFamily || 'esta familia'}).</p>
        <p><strong>Foco vigente: {focus.label}.</strong> {focus.mode === 'foco' ? 'Vale hasta el domingo.' : 'Podés fijar una familia para toda la semana.'}</p>
        <label>Foco de la semana
          <select aria-label="Foco de la semana" value={focus.mode === 'foco' ? focus.family : ''} onChange={(event) => setFocus(event.target.value)}>
            <option value="">Rotación diaria</option>
            {PROSPECT_FAMILIES.filter((item) => familyIsActive(item.key, switches)).map((item) => <option key={item.key}>{item.key}</option>)}
          </select>
        </label>
        <div className="panel-head-actions">
          <label>Familia de hoy
            <select aria-label="Familia de hoy" value={planFamily} onChange={(event) => setPlanFamily(event.target.value)}>
              {PROSPECT_FAMILIES.filter((item) => familyIsActive(item.key, switches)).map((item) => <option key={item.key}>{item.key}</option>)}
            </select>
          </label>
          <span className="muted">Alcance: {scopeDescription(planFamily)}</span>
        </div>
        <div className="panel-head-actions">
          {suggestions.map(({ zone: item, status, habPorPunto }) => (
            <button key={item.id} type="button" className={zone?.id === item.id ? 'primary' : 'secondary'} onClick={() => setZone(item)}>
              {item.nombre}{provinces[item.prov] ? ` (${provinces[item.prov]})` : ''} · {status}{habPorPunto ? ` · ${Math.round(habPorPunto).toLocaleString('es-AR')} hab/punto` : ''}
            </button>
          ))}
          {cities.length === 0 && <span className="muted">Cargando zonas…</span>}
          {cities.length > 0 && <span className="muted">{ranking ? 'Orden: déficit de cobertura (habitantes por cliente o prospecto de la familia).' : 'Esta familia todavía no tiene datos: se ordena por población.'}</span>}
        </div>
        <label>Otra zona
          <input value={zoneQuery} onChange={(event) => setZoneQuery(event.target.value)} placeholder="Escribí una ciudad (mínimo 3 letras)" />
        </label>
        {zoneMatches.length > 0 && (
          <div className="panel-head-actions">
            {zoneMatches.map((item) => (
              <button key={item.id} type="button" className="secondary" onClick={() => { setZone(item); setZoneQuery(''); }}>
                {item.nombre}{provinces[item.prov] ? ` (${provinces[item.prov]})` : ''} · {zoneStatus(planFamily, item.id, searches, today).status}
              </button>
            ))}
          </div>
        )}
        <label>Rubros a buscar (separados por coma)
          <input value={rubrosText} onChange={(event) => setRubrosText(event.target.value)} />
        </label>
        <div className="panel-head-actions">
          <button type="button" className="primary" disabled={!zone || searching || !session?.access_token} onClick={runSearch}>
            <Search size={16} /> {searching ? 'Buscando…' : zone ? `Buscar en ${zone.nombre}` : 'Elegí una zona'}
          </button>
          <button type="button" className="secondary" disabled={!zone} onClick={closeZone}>Terminé esta zona (por ahora)</button>
        </div>
      </div>
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
        <summary><FileUp size={14} /> Importar o pegar una lista de prospectos</summary>
        <p className="muted">Subí un CSV o pegá las filas copiadas de la planilla, con los encabezados en la primera fila (Nombre empresa, Familia, Subfamilia, provincia, ciudad, Maquina, Proveedor, telefono, email, Estado, Comercial, Contacto, observaciones, Fecha de seguimiento, Tipo entidad, Producto / propuesta, Estado comercial, Valor potencial, Próxima acción, Fecha próxima acción). Antes de guardar vas a ver cuántas son nuevas, cuántas ya están en el CRM y cuántas son posibles duplicadas.</p>
        <label className="secondary upload-button"><FileUp size={14} /> Elegir un CSV
          <input type="file" accept=".csv,.txt,text/csv" hidden aria-label="Archivo de prospectos" onChange={importFile} />
        </label>
        <textarea rows={5} value={importText} onChange={(event) => setImportText(event.target.value)} aria-label="Lista de prospectos" />
        <button type="button" className="secondary" disabled={!importText.trim()} onClick={() => analyzeImport(importText)}>Revisar lista</button>
        {importPlan && (
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
        )}
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

      <SearchHistory searches={searches} />

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

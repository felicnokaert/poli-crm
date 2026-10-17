import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { AI_TOOLS } from './prospect-playbook.mjs';
import { buildCompetitorRow, parseCompetitorList, slugifyCompetitor } from './competitor-battlecard.mjs';
import { isChannelAdmin } from './user-channels.mjs';

// Fichas de competidores (tabla compartida `competitors`, solo lectura) y pedidos de
// profundización a Claude (tabla prospect_requests, familia "COMPETENCIA: <nombre>").
export function buildCompetitorPrompt(competitor) {
  return [
    `Investigá en la web a la empresa competidora "${competitor.name}" (${competitor.website || 'sin sitio cargado'}) para Grupo Poliplast, que vende poliuretano, fibra de vidrio y resinas en Argentina.`,
    'Quiero, con fuente y link para cada dato: líneas de producto y marcas que vende, a qué clientes/rubros apunta, dónde está y a qué zonas llega, canales de venta, precios publicados (si los hay), novedades de los últimos 12 meses, redes sociales y teléfono/email comerciales.',
    'No inventes nada: si un dato no se puede verificar, escribí "no verificado". Terminá con 3 puntos donde Poliplast puede competir mejor y 3 donde ellos nos ganan.',
    `Lo que ya sabemos: ${competitor.summary}`,
  ].join('\n');
}

export function hostOf(value = '') {
  const text = String(value).trim();
  if (!text) return '';
  try { return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function newCompetitorLabel(form = {}) {
  return String(form.name || '').trim() || hostOf(form.website) || hostOf(form.instagram) || hostOf(form.facebook) || '';
}

export function buildNewCompetitorPrompt(form = {}) {
  const links = [['Sitio web', form.website], ['Facebook', form.facebook], ['Instagram', form.instagram]].filter(([, value]) => String(value || '').trim());
  return [
    `Un comercial de Grupo Poliplast (poliuretano, fibra de vidrio y resinas en Argentina) encontró un posible competidor y quiere su ficha: "${newCompetitorLabel(form)}".`,
    links.length ? `Datos que cargó: ${links.map(([label, value]) => `${label}: ${String(value).trim()}`).join(' · ')}.` : 'No cargó links: buscá la empresa por el nombre.',
    form.family ? `Familia de Poliplast con la que compite, según el comercial: ${form.family}.` : 'Decidí con qué familias de Poliplast compite (Penosil, Carrozados, Imperpur, Planchas, Resinplast, PURMAC, Poliurea, Poliuretano, Química).',
    'Investigá en la web con fuente y link para cada dato: qué es (fabricante, distribuidor o comercio), productos, dónde está, canales de venta, precios publicados si los hay, redes, teléfono y email comerciales. Facebook e Instagram suelen no poder leerse: usalos para el nombre y los links, y buscá la información en la web y en otras fuentes.',
    'No inventes nada: lo que no se pueda verificar va como "no verificado". Si no es un competidor real, decilo.',
    'Al terminar, creá la ficha en la tabla competitors con reviewed = false.',
  ].join('\n');
}

export function filterCompetitors(rows = [], family = 'Todas') {
  if (!family || family === 'Todas') return rows;
  return rows.filter((item) => (item.families || []).includes(family));
}

export function Competencia({ supabase, userEmail, families = [], family: initialFamily = 'Todas' }) {
  const [rows, setRows] = useState(null);
  const [requests, setRequests] = useState([]);
  const [family, setFamily] = useState(initialFamily);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [manual, setManual] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState('');
  const canDelete = isChannelAdmin(userEmail);

  useEffect(() => { setFamily(initialFamily || 'Todas'); }, [initialFamily]);

  async function load() {
    if (!supabase) { setRows([]); return; }
    const [comp, reqs] = await Promise.all([
      supabase.from('competitors').select('*').order('name'),
      supabase.from('prospect_requests').select('id,family,status,progress,result_markdown,created_at,scope,notes').like('family', 'COMPETENCIA%').order('created_at', { ascending: false }),
    ]);
    if (comp.error) { setError('No se pudieron cargar las fichas.'); setRows([]); return; }
    setRows((comp.data || []).filter((item) => item.kind !== 'cliente'));
    setRequests(reqs.data || []);
  }
  useEffect(() => { load(); }, [supabase]);

  async function ask(competitor) {
    try {
      const { error: insertError } = await supabase.from('prospect_requests').insert({
        id: crypto.randomUUID(), user_email: String(userEmail || '').trim().toLowerCase(),
        family: `COMPETENCIA: ${competitor.name}`, scope: 'competencia', wanted: 1, notes: '', prompt: buildCompetitorPrompt(competitor),
      });
      if (insertError) throw insertError;
      setMessage(`Pedido enviado para ${competitor.name}. Lo procesa el equipo de Claude de Poliplast y el resultado aparece en la ficha.`);
      load();
    } catch {
      setMessage('No se pudo enviar el pedido. Probá de nuevo.');
    }
  }

  // Felipe 17/10: al cargar nombre y link, investigar en el momento y dejar la ficha hecha (no "en proceso").
  // El servidor lee el sitio (o lo busca por el nombre) sin IA paga; si no puede, se abre la carga a mano
  // con lo que ya se sabe.
  async function researchNow({ name, website, family: chosenFamily, kind }) {
    const label = String(name || '').trim() || hostOf(website);
    setError('');
    setBusy(label);
    setMessage(`Investigando ${label}: leyendo su sitio web…`);
    try {
      const { data: auth } = await supabase.auth.getSession();
      const response = await fetch('/api/prospeccion', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth?.session?.access_token || ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'competitor', name, website, family: chosenFamily, kind }),
      });
      const result = await response.json().catch(() => ({ ok: false, error: 'El servidor no respondió.' }));
      if (!result.ok) throw new Error(result.error || 'No se pudo leer el sitio.');
      const found = result.competitor;
      const row = { ...found, id: slugifyCompetitor(found.name), reviewed: false, updated_at: new Date().toISOString() };
      if ((rows || []).some((item) => item.id === row.id || slugifyCompetitor(item.name) === row.id)) {
        setMessage(`${found.name} ya estaba cargado. Lo encontrás en la lista.`);
        return true;
      }
      const { error: insertError } = await supabase.from('competitors').insert(row);
      if (insertError) throw new Error(insertError.code === '23505' ? 'Ya existe un competidor con ese nombre.' : 'No se pudo guardar la ficha.');
      const got = [found.products?.length && 'productos', found.location && 'dirección', found.channels && 'contacto', found.families?.length && 'familias'].filter(Boolean);
      setForm(null);
      setFamily('Todas');
      const pagesRead = found.sources.filter((src) => !/instagram|facebook/i.test(src.u)).length;
      const doubt = /^El sitio \(|Ojo:/.test(found.caveats || '') ? ` ${found.caveats.split(' Ficha armada')[0]}` : '';
      setMessage(`Listo: ${found.name} (${hostOf(found.website)}). Se leyeron ${pagesRead} página${pagesRead === 1 ? '' : 's'} de su sitio${got.length ? ` y se anotó: ${got.join(', ')}` : ''}. Quedó "sin revisar" hasta que alguien la confirme.${doubt}`);
      await load();
      return true;
    } catch (failure) {
      setMessage('');
      setError(`${failure.message} Te abrimos la carga a mano con lo que ya sabemos.`);
      setForm(null);
      setManual({ name: label, kind: kind || 'fabricante', family: chosenFamily || '', summary: '', website: website || '', location: '' });
      return false;
    } finally {
      setBusy('');
    }
  }

  async function submitNew(event) {
    event.preventDefault();
    const label = newCompetitorLabel(form);
    if (!label) { setMessage('Cargá al menos el nombre o el link de su sitio.'); return; }
    await researchNow({ name: form.name.trim(), website: form.website.trim() || '', family: form.family });
  }

  async function addManual(event) {
    event.preventDefault();
    const row = buildCompetitorRow(manual);
    if (!row) return;
    setError(''); setMessage('');
    const { error: insertError } = await supabase.from('competitors').insert(row);
    if (insertError) {
      setError(insertError.code === '23505' ? 'Ya existe un competidor con ese nombre.' : 'No se pudo guardar el competidor.');
      return;
    }
    setManual(null);
    setMessage(`${row.name} quedó cargado para todo el equipo (sin revisar).`);
    await load();
  }

  // Varios de una vez (pedido de Felipe 16/10: "los competidores de poliuretano que tenemos son…").
  async function addBulk(event) {
    event.preventDefault();
    const existing = new Set((rows || []).flatMap((item) => [item.id, slugifyCompetitor(item.name)]));
    const list = parseCompetitorList(bulk.text).map((name) => buildCompetitorRow({ name, kind: bulk.kind, family: bulk.family }));
    const fresh = list.filter((row) => row && !existing.has(row.id));
    const repeated = list.length - fresh.length;
    if (!fresh.length) { setError(repeated ? 'Todos los de la lista ya estaban cargados.' : 'Pegá al menos un nombre.'); return; }
    setError(''); setMessage('');
    const { error: insertError } = await supabase.from('competitors').insert(fresh);
    if (insertError) { setError('No se pudieron guardar. Probá de nuevo o cargalos de a uno.'); return; }
    setBulk(null);
    setMessage(`Cargados ${fresh.length} competidores para todo el equipo (sin revisar)${repeated ? `; ${repeated} ya estaban` : ''}.`);
    await load();
  }

  // Reclasificar (solo Felipe): cambia las familias con las que compite. Si la base no deja editar
  // la ficha, la reemplaza por la misma con las familias nuevas (y si eso falla, la deja como estaba).
  async function saveFamilies(item, nextFamilies) {
    if (!canDelete) return;
    setError(''); setMessage('');
    const { data: updated, error: updateError } = await supabase.from('competitors').update({ families: nextFamilies }).eq('id', item.id).select('id');
    if (updateError || !updated?.length) {
      const { error: deleteError } = await supabase.from('competitors').delete().eq('id', item.id);
      if (deleteError) { setError('No se pudo cambiar la familia.'); return; }
      const { error: insertError } = await supabase.from('competitors').insert({ ...item, families: nextFamilies });
      if (insertError) {
        await supabase.from('competitors').insert(item);
        setError('No se pudo cambiar la familia; la ficha quedó como estaba.');
        await load();
        return;
      }
    }
    setEditing(null);
    setMessage(`${item.name}: ${nextFamilies.length ? nextFamilies.join(' · ') : 'sin familia'}.`);
    await load();
  }

  async function remove(item) {
    if (!canDelete || !window.confirm(`¿Borrar a ${item.name} para todo el equipo?`)) return;
    const { error: deleteError } = await supabase.from('competitors').delete().eq('id', item.id);
    if (deleteError) { setError('No se pudo borrar.'); return; }
    setMessage(`${item.name} se borró.`);
    await load();
  }

  async function copy(competitor) {
    try {
      await navigator.clipboard.writeText(buildCompetitorPrompt(competitor));
      setMessage(`Pedido de ${competitor.name} copiado. Pegalo en tu IA (ChatGPT, Gemini, Perplexity o Claude).`);
    } catch {
      setMessage('No se pudo copiar. Seleccioná el texto del pedido y copialo a mano.');
    }
  }

  const available = (families || []).filter((name) => (rows || []).some((item) => (item.families || []).includes(name)));
  const shown = filterCompetitors(rows || [], family);
  // Pedidos de competidor nuevo todavía sin ficha. Felipe 17/10: "Tecno Ref sigue en proceso, no cargó nunca su info"
  // (los procesa una sesión de Claude con la base, que no siempre está corriendo): se pueden cargar a mano desde acá
  // y el pedido deja de figurar apenas existe la ficha.
  const waiting = useMemo(() => {
    const loaded = new Set((rows || []).map((item) => slugifyCompetitor(item.name)));
    return requests.filter((req) => req.family.startsWith('COMPETENCIA NUEVA:') && req.status !== 'lista' && !loaded.has(slugifyCompetitor(req.family.replace('COMPETENCIA NUEVA: ', ''))));
  }, [requests, rows]);
  function manualFromRequest(req) {
    const links = String(req.scope || '').split(' · ').filter((item) => item && item !== 'solo nombre');
    const website = links.find((item) => !/facebook|instagram/i.test(item)) || '';
    setForm(null);
    setManual({ name: req.family.replace('COMPETENCIA NUEVA: ', ''), kind: 'fabricante', family: families.includes(req.notes) ? req.notes : '', summary: '', website, location: '' });
  }

  return (
    <details className="panel competitor-panel" open>
      <summary><strong>Competencia</strong> <span className="muted small">{rows ? `${shown.length} de ${rows.length} empresas` : 'cargando…'}</span></summary>
      <p className="muted">Quién compite en cada familia, con la fuente de cada dato. Lo que no está verificado figura como tal; nada se completa por suposición.</p>
      <div className="segmented" role="group" aria-label="Familia de la competencia">
        {['Todas', ...available].map((name) => (
          <button key={name} type="button" className={family === name ? 'selected' : ''} aria-pressed={family === name} onClick={() => setFamily(name)}>{name}</button>
        ))}
      </div>
      {supabase && (
        <div className="panel-head-actions competitor-tools">
          <button type="button" className="secondary" onClick={() => setForm(form ? null : { name: '', website: '', facebook: '', instagram: '', family: '' })}>+ Cargar un competidor nuevo</button>
          <button type="button" className="secondary" onClick={() => setManual(manual ? null : { name: '', kind: 'fabricante', family: '', summary: '', website: '', location: '' })}>+ Agregar a mano</button>
          <button type="button" className="secondary" onClick={() => setBulk(bulk ? null : { text: '', kind: 'fabricante', family: '' })}>+ Pegar varios</button>
        </div>
      )}
      {bulk && (
        <form className="form-grid" onSubmit={addBulk}>
          <p className="muted small span-2">Un competidor por renglón. Quedan visibles para todos y marcados "sin revisar"; los que ya están cargados se saltean.</p>
          <label className="span-2">Nombres
            <textarea rows={6} value={bulk.text} onChange={(event) => setBulk({ ...bulk, text: event.target.value })} placeholder={"Alkanos\nPolytal\nPoliresinas"} />
          </label>
          <label>Tipo
            <select value={bulk.kind} onChange={(event) => setBulk({ ...bulk, kind: event.target.value })}>
              <option value="fabricante">Fabricante</option><option value="equipos">Vende máquinas / equipos</option><option value="distribuidor">Distribuidor</option>
            </select>
          </label>
          <label>Familia con la que compiten
            <select value={bulk.family} onChange={(event) => setBulk({ ...bulk, family: event.target.value })}>
              <option value="">No sé</option>
              {families.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <div className="panel-head-actions span-2">
            <button type="submit" className="primary">Guardar {parseCompetitorList(bulk.text).length || ''}</button>
            <button type="button" className="secondary" onClick={() => setBulk(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {manual && (
        <form className="form-grid" onSubmit={addManual}>
          <p className="muted small span-2">Cualquiera del equipo puede cargar un competidor. Queda visible para todos y marcado "sin revisar"; solo Felipe puede borrarlo.</p>
          <label>Nombre<input required value={manual.name} onChange={(event) => setManual({ ...manual, name: event.target.value })} /></label>
          <label>Tipo
            <select value={manual.kind} onChange={(event) => setManual({ ...manual, kind: event.target.value })}>
              <option value="fabricante">Fabricante</option><option value="equipos">Vende máquinas / equipos</option><option value="distribuidor">Distribuidor</option>
            </select>
          </label>
          <label>Familia con la que compite
            <select value={manual.family} onChange={(event) => setManual({ ...manual, family: event.target.value })}>
              <option value="">No sé</option>
              {families.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <label>Sitio web<input value={manual.website} onChange={(event) => setManual({ ...manual, website: event.target.value })} /></label>
          <label>Dónde está<input value={manual.location} onChange={(event) => setManual({ ...manual, location: event.target.value })} /></label>
          <label className="span-2">Qué sabés de ellos<input value={manual.summary} onChange={(event) => setManual({ ...manual, summary: event.target.value })} /></label>
          <div className="panel-head-actions span-2">
            <button type="submit" className="primary">Guardar</button>
            <button type="button" className="secondary" onClick={() => setManual(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {form && (
        <form className="form-grid" onSubmit={submitNew}>
          <p className="muted small span-2">Alcanza con el nombre o el link. El CRM lee su sitio en el momento y arma la ficha con la fuente de cada dato (sin IA paga, sin inventar). Facebook e Instagram no se pueden leer: si es lo único que tenés, cargalo a mano.</p>
          <label>Nombre<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Sitio web<input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} placeholder="ejemplo.com.ar" /></label>
          <label>Familia con la que compite (opcional)
            <select value={form.family} onChange={(event) => setForm({ ...form, family: event.target.value })}>
              <option value="">No sé</option>
              {families.map((name) => <option key={name}>{name}</option>)}
            </select>
          </label>
          <div className="panel-head-actions span-2">
            <button type="submit" className="primary" disabled={Boolean(busy)}>{busy ? 'Investigando…' : 'Investigar y crear la ficha'}</button>
            <button type="button" className="secondary" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {waiting.length > 0 && (
        <div className="history-list">
          {waiting.map((req) => (
            <article key={req.id} className="history-card">
              <div>
                <strong>{req.family.replace('COMPETENCIA NUEVA: ', '')}</strong>
                <span className="muted small">{String(req.created_at).slice(0, 10)} · <em className="badge">{req.status === 'error' ? 'falló' : 'sin ficha todavía'}</em></span>
                {req.status === 'error' && req.progress && <span className="muted small">{req.progress}</span>}
                {req.scope && req.scope !== 'solo nombre' && <span className="muted small">{req.scope}</span>}
              </div>
              <div className="competitor-admin">
                <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => { const links = String(req.scope || '').split(' · ').filter((item) => item && item !== 'solo nombre'); researchNow({ name: req.family.replace('COMPETENCIA NUEVA: ', ''), website: links.find((item) => !/facebook|instagram/i.test(item)) || '', family: families.includes(req.notes) ? req.notes : '' }); }}>{busy === req.family.replace('COMPETENCIA NUEVA: ', '') ? 'Investigando…' : 'Investigar ahora'}</button>
                <button type="button" className="secondary" onClick={() => manualFromRequest(req)}>Cargar a mano</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {message && <div className="system-message">{message}</div>}
      {error && <div className="system-message">{error}</div>}
      {rows && rows.length === 0 && !error && <p className="muted">{supabase ? 'Todavía no hay competidores cargados.' : 'Las fichas de competencia están disponibles en la versión en línea.'}</p>}
      {rows && rows.length > 0 && shown.length === 0 && <p className="muted">Todavía no hay competidores verificados para {family}.</p>}
      <div className="units-list">
        {shown.map((item) => {
          const mine = requests.filter((req) => req.family === `COMPETENCIA: ${item.name}`);
          return (
            <article key={item.id} className="unit-card competitor-card">
              <div>
                <strong>{item.name}</strong>
                <span><em className="badge">{item.kind}</em>{item.reviewed === false && <em className="badge warn">Sin revisar</em>} {(item.families || []).join(' · ')}</span>
                <span>{item.summary}</span>
                <span><b>Productos:</b> {(item.products || []).join(' · ')}</span>
                <span><b>Dónde:</b> {item.location}</span>
                <span><b>Cómo vende:</b> {item.channels}</span>
                {item.caveats && <span className="muted small"><b>Sin verificar:</b> {item.caveats}</span>}
                <span className="small">
                  {(item.sources || []).map((src) => <a key={src.u} className="link-pill" href={src.u} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {src.t}</a>)}
                </span>
                {mine.map((req) => (
                  <details key={req.id} open={req.status === 'lista'}>
                    <summary>Investigación del {String(req.created_at).slice(0, 10)} · {req.status === 'lista' ? 'resultado listo' : req.status === 'error' ? 'falló' : 'en proceso'}</summary>
                    {req.result_markdown ? <pre className="competitor-result">{req.result_markdown}</pre> : <p className="muted small">Todavía sin resultado.</p>}
                  </details>
                ))}
                {canDelete && editing?.id === item.id && (
                  <fieldset className="competitor-families">
                    <legend>Familias con las que compite</legend>
                    {families.map((name) => (
                      <label key={name} className="check-line">
                        <input type="checkbox" checked={editing.families.includes(name)} onChange={(event) => setEditing({ ...editing, families: event.target.checked ? [...editing.families, name] : editing.families.filter((f) => f !== name) })} /> {name}
                      </label>
                    ))}
                    <div className="panel-head-actions">
                      <button type="button" className="primary" onClick={() => saveFamilies(item, editing.families)}>Guardar familias</button>
                      <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancelar</button>
                    </div>
                  </fieldset>
                )}
                {canDelete && (
                  <div className="competitor-admin">
                    {editing?.id !== item.id && <button type="button" className="secondary" onClick={() => setEditing({ id: item.id, families: item.families || [] })}>Cambiar familias</button>}
                    <button type="button" className="danger-link" onClick={() => remove(item)}>Borrar (solo Felipe)</button>
                  </div>
                )}
                <details>
                  <summary>Profundizar sobre {item.name}</summary>
                  <p className="muted small">Sin Claude: copiá el pedido y pegalo en tu IA. Con el equipo: lo pedís acá y lo procesa Claude de Poliplast.</p>
                  <div className="panel-head-actions">
                    <button type="button" className="secondary" onClick={() => copy(item)}>Copiar pedido para mi IA</button>
                    {AI_TOOLS.map((tool) => <a key={tool.name} className="secondary link-pill" href={tool.url} target="_blank" rel="noreferrer">Abrir {tool.name}</a>)}
                    {supabase && <button type="button" className="secondary" onClick={() => ask(item)}><Search size={14} /> Pedir al equipo</button>}
                  </div>
                </details>
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}

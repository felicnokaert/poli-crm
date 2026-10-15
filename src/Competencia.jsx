import { useEffect, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';
import { AI_TOOLS } from './prospect-playbook.mjs';

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

  useEffect(() => { setFamily(initialFamily || 'Todas'); }, [initialFamily]);

  async function load() {
    if (!supabase) { setRows([]); return; }
    const [comp, reqs] = await Promise.all([
      supabase.from('competitors').select('*').order('name'),
      supabase.from('prospect_requests').select('id,family,status,progress,result_markdown,created_at').like('family', 'COMPETENCIA:%').order('created_at', { ascending: false }),
    ]);
    if (comp.error) { setError('No se pudieron cargar las fichas.'); setRows([]); return; }
    setRows(comp.data || []);
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

  return (
    <details className="panel competitor-panel" open>
      <summary><strong>Competencia</strong> <span className="muted small">{rows ? `${shown.length} de ${rows.length} empresas` : 'cargando…'}</span></summary>
      <p className="muted">Quién compite en cada familia, con la fuente de cada dato. Lo que no está verificado figura como tal; nada se completa por suposición.</p>
      <div className="segmented" role="group" aria-label="Familia de la competencia">
        {['Todas', ...available].map((name) => (
          <button key={name} type="button" className={family === name ? 'selected' : ''} aria-pressed={family === name} onClick={() => setFamily(name)}>{name}</button>
        ))}
      </div>
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
                <span><em className="badge">{item.kind}</em> {(item.families || []).join(' · ')}</span>
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

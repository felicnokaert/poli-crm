import { useEffect, useState } from 'react';
import { ExternalLink, Search } from 'lucide-react';

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

export function Competencia({ supabase, userEmail }) {
  const [rows, setRows] = useState(null);
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
      setMessage(`Pedido enviado para ${competitor.name}. Abrí tu sesión de Claude y decile: "procesá los pedidos de Prospección". El resultado aparece acá.`);
      load();
    } catch {
      setMessage('No se pudo enviar el pedido. Probá de nuevo.');
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Mercado</span>
          <h2>Competencia</h2>
          <p>Fichas de los competidores con la fuente de cada dato. Lo que no está verificado figura como tal; nada se completa por suposición.</p>
        </div>
      </div>
      {message && <div className="system-message">{message}</div>}
      {error && <div className="system-message">{error}</div>}
      {rows === null && <p className="muted">Cargando…</p>}
      {rows && rows.length === 0 && !error && <p className="muted">{supabase ? 'Todavía no hay competidores cargados.' : 'Las fichas de competencia están disponibles en la versión en línea.'}</p>}
      <div className="units-list">
        {(rows || []).map((item) => {
          const mine = requests.filter((req) => req.family === `COMPETENCIA: ${item.name}`);
          return (
            <article key={item.id} className="unit-card competitor-card">
              <div>
                <strong>{item.name}</strong>
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
                    <summary>Investigación del {String(req.created_at).slice(0, 10)} · {req.status === 'lista' ? 'resultado listo' : req.status === 'error' ? 'falló' : 'esperando a Claude'}</summary>
                    {req.result_markdown ? <pre className="competitor-result">{req.result_markdown}</pre> : <p className="muted small">Todavía sin resultado.</p>}
                  </details>
                ))}
              </div>
              <div className="panel-head-actions">
                <button type="button" className="secondary" onClick={() => ask(item)}><Search size={14} /> Pedir a Claude que profundice</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

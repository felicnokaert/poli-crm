import { useState } from 'react';
import { TECH_TOPICS, searchText, technicalAnswer, whatsappText } from './technical-replies.mjs';
import { QUICK_GROUPS, fillReply, searchReplies } from './quick-replies.mjs';

// Respuestas rápidas para WhatsApp: se busca, se completa el nombre y se copia con un toque.
// Técnicas: lo que el equipo ya respondió en Mercado Libre (más repetido) y lo enseñado, por producto y tema.
function TechnicalReplies({ supabase, nombre }) {
  const [product, setProduct] = useState('');
  const [topic, setTopic] = useState('rendimiento');
  const [state, setState] = useState({ status: 'idle' });
  const [copied, setCopied] = useState('');
  async function search() {
    if (!product.trim() || !supabase?.rpc) return;
    setState({ status: 'loading' });
    try {
      const { q } = searchText(product, topic);
      const [ml, kn] = await Promise.all([
        supabase.rpc('search_ml_knowledge', { q, max_rows: 40 }),
        supabase.from('assistant_knowledge').select('id,question,product,answer'),
      ]);
      setState({ status: 'ready', ...technicalAnswer({ rows: ml?.data || [], taught: kn?.data || [], product, topicKey: topic }) });
    } catch { setState({ status: 'error' }); }
  }
  async function copy(id, text) {
    const full = whatsappText(text, { nombre });
    try { await navigator.clipboard.writeText(full); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { window.prompt('Copiá el texto:', full); }
  }
  const Card = ({ id, label, text, note }) => (
    <article className="unit-card">
      <div><strong>{label}</strong><span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>{note && <span className="muted small">{note}</span>}</div>
      <button type="button" className="secondary" onClick={() => copy(id, text)}>{copied === id ? 'Copiado ✓' : 'Copiar'}</button>
    </article>
  );
  return (
    <section className="panel">
      <h3>Respuestas técnicas por producto</h3>
      <p className="muted small">Sale de lo que el equipo ya respondió en Mercado Libre y de lo que Felipe validó. No inventa: si no hay datos, lo dice. Confirmá siempre con la ficha antes de prometer algo.</p>
      <div className="list-toolbar">
        <input placeholder="Producto (ej. poxiplast, easyspray…)" value={product} onChange={(event) => setProduct(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && search()} aria-label="Producto" />
        <select value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Tema">{TECH_TOPICS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
        <button type="button" className="primary" disabled={!product.trim() || state.status === 'loading'} onClick={search}>Buscar</button>
      </div>
      {state.status === 'loading' && <p className="muted">Buscando…</p>}
      {state.status === 'error' && <p className="muted">No se pudo buscar. Probá de nuevo.</p>}
      {state.status === 'ready' && (
        <div className="units-list">
          {state.taught.map((entry) => <Card key={entry.id} id={`t${entry.id}`} label="Validada por Felipe" text={entry.answer} note={entry.question} />)}
          {state.team && !state.team.varied && <Card id="team" label="Lo que más repetimos en Mercado Libre" text={state.team.text} note={`Lo respondimos así en ${state.team.uses} de ${state.team.total} preguntas.`} />}
          {state.team?.varied && state.team.examples.map((text, index) => <Card key={index} id={`v${index}`} label="Respuesta dada (no hay una que se repita)" text={text} note="Las respuestas varían: revisá la ficha antes de usarla." />)}
          {!state.taught.length && !state.team && <p className="muted">No hay respuestas del equipo sobre eso. Mirá la ficha técnica o consultá con el área técnica.</p>}
        </div>
      )}
    </section>
  );
}

export default function QuickReplies({ defaultSender = '', supabase = null }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [nombre, setNombre] = useState('');
  const [copied, setCopied] = useState('');
  const [sender] = useState(() => { try { return localStorage.getItem('poliplast-sender-name') || defaultSender; } catch { return defaultSender; } });
  const list = searchReplies(query, group);
  async function copy(item) {
    const text = fillReply(item.text, { nombre, yo: sender });
    try { await navigator.clipboard.writeText(text); setCopied(item.id); setTimeout(() => setCopied(''), 1500); } catch { window.prompt('Copiá el texto:', text); }
  }
  return (
    <>
    {supabase && <TechnicalReplies supabase={supabase} nombre={nombre} />}
    <section className="panel">
      <p className="eyebrow">Para contestar rápido</p>
      <h2>Respuestas rápidas de WhatsApp</h2>
      <p className="muted small">Basadas en la Academia comercial (proceso comercial y método E-C-E-R-A: escuchar, confirmar, explorar, responder, acordar). Editá lo que esté entre [corchetes] antes de enviar. No inventan precios, stock ni plazos: eso se confirma con quien corresponda.</p>
      <div className="list-toolbar">
        <input type="search" placeholder="Buscar (precio, proveedor, ficha…)" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar respuesta" />
        <input placeholder="Nombre del contacto (opcional)" value={nombre} onChange={(event) => setNombre(event.target.value)} aria-label="Nombre del contacto" />
      </div>
      <div className="queue-actions" role="tablist" aria-label="Tipo de respuesta">
        <button type="button" className={group === '' ? 'primary' : 'secondary'} onClick={() => setGroup('')}>Todas</button>
        {QUICK_GROUPS.map(([key, label]) => <button key={key} type="button" className={group === key ? 'primary' : 'secondary'} onClick={() => setGroup(key)}>{label}</button>)}
      </div>
      {list.length === 0 && <p className="muted">No hay respuestas con esa búsqueda.</p>}
      <div className="units-list">
        {list.map((item) => (
          <article className="unit-card" key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span style={{ whiteSpace: 'pre-wrap' }}>{fillReply(item.text, { nombre, yo: sender })}</span>
              {item.tip && <span className="muted small">Tip: {item.tip}</span>}
            </div>
            <button type="button" className="secondary" onClick={() => copy(item)}>{copied === item.id ? 'Copiado ✓' : 'Copiar'}</button>
          </article>
        ))}
      </div>
    </section>
    </>
  );
}

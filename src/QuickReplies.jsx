import { useState } from 'react';
import { QUICK_GROUPS, fillReply, searchReplies } from './quick-replies.mjs';

// Respuestas rápidas para WhatsApp: se busca, se completa el nombre y se copia con un toque.
export default function QuickReplies({ defaultSender = '' }) {
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
  );
}

import { useState } from 'react';
import { Check, NotebookPen, Plus, RotateCcw, Trash2 } from 'lucide-react';

const QUICK_TAGS = [
  'Pre venta Easy Spray',
  'Pasar factura',
  'Llamar',
  'Seguimiento',
  'Otro',
];

export default function Notepad({ items, onSave, onDelete }) {
  const [tag, setTag] = useState(QUICK_TAGS[0]);
  const [text, setText] = useState('');
  const pending = items.filter((item) => !item.done).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const done = items.filter((item) => item.done).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  function addNote(event) {
    event.preventDefault();
    if (!text.trim()) return;
    onSave({ id: crypto.randomUUID(), tag, text: text.trim(), done: false, createdAt: new Date().toISOString() });
    setText('');
  }

  function toggleDone(note) {
    onSave({ ...note, done: !note.done });
  }

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Ayuda memoria</span>
            <h2>Agenda</h2>
            <p>Para anotar lo de Penosil (consumidor final) sin meterlo en el chat en vivo del CRM: pre venta de Easy Spray, pasar factura, lo que necesites recordar.</p>
          </div>
          <NotebookPen size={22} />
        </div>
        <form className="notepad-form" onSubmit={addNote}>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            {QUICK_TAGS.map((item) => <option key={item}>{item}</option>)}
          </select>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ej: Cliente de Villa María, pasar factura de 3 tarros de Easy Spray"
          />
          <button type="submit" className="primary"><Plus size={16}/> Agregar</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Pendientes</span><h2>Por hacer</h2></div><span className="inbox-count">{pending.length}</span></div>
        <div className="opportunity-list">
          {pending.map((note) => (
            <div className="notepad-row" key={note.id}>
              <div><span className="notepad-tag">{note.tag}</span><p>{note.text}</p></div>
              <div className="notepad-actions">
                <button type="button" className="secondary" onClick={() => toggleDone(note)}><Check size={15}/> Hecho</button>
                <button type="button" className="danger-link" onClick={() => onDelete(note.id)}><Trash2 size={15}/></button>
              </div>
            </div>
          ))}
          {!pending.length && <div className="empty-opportunities"><NotebookPen/><p>No hay notas pendientes.</p></div>}
        </div>
      </section>
      {done.length > 0 && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Resueltas</span><h2>Hechas</h2></div><span className="inbox-count">{done.length}</span></div>
          <div className="opportunity-list">
            {done.map((note) => (
              <div className="notepad-row done" key={note.id}>
                <div><span className="notepad-tag">{note.tag}</span><p>{note.text}</p></div>
                <div className="notepad-actions">
                  <button type="button" className="secondary" onClick={() => toggleDone(note)}><RotateCcw size={15}/> Reabrir</button>
                  <button type="button" className="danger-link" onClick={() => onDelete(note.id)}><Trash2 size={15}/></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { useState } from 'react';
import { GripVertical, LayoutGrid, Plus, Trash2, X } from 'lucide-react';

const TAG_COLORS = {
  '': '#8ba099',
  Penosil: '#d9792b',
  Marketplace: '#3b6d9b',
  Catálogo: '#6b5aa6',
  'Mercado Libre': '#f2b705',
  Shopify: '#95bf47',
  Urgente: '#c0392b',
};

function tagColor(tag) {
  return TAG_COLORS[tag] || '#5a7a70';
}

function nextOrder(cards) {
  return cards.length ? Math.max(...cards.map((item) => item.order || 0)) + 1 : 0;
}

export default function Board({ lists, cards, onSaveList, onDeleteList, onSaveCard, onDeleteCard, onMoveCard }) {
  const [addingListTitle, setAddingListTitle] = useState('');
  const [editingCard, setEditingCard] = useState(null);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const orderedLists = [...lists].sort((a, b) => (a.order || 0) - (b.order || 0));

  function addList(event) {
    event.preventDefault();
    if (!addingListTitle.trim()) return;
    onSaveList({ id: crypto.randomUUID(), title: addingListTitle.trim(), order: nextOrder(lists) });
    setAddingListTitle('');
  }

  function cardsFor(listId) {
    return cards.filter((card) => card.listId === listId).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  function handleDrop(listId, beforeCardId) {
    if (!draggingCardId) return;
    onMoveCard(draggingCardId, listId, beforeCardId);
    setDraggingCardId(null);
  }

  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Organización</span>
            <h2>Tablero</h2>
            <p>Todo lo que no es venta directa: Penosil, Marketplace, catálogo, Mercado Libre, Shopify, lo que necesites. Creá tus propias listas y arrastrá las tarjetas.</p>
          </div>
          <LayoutGrid size={22} />
        </div>
        <form className="board-add-list" onSubmit={addList}>
          <input value={addingListTitle} onChange={(e) => setAddingListTitle(e.target.value)} placeholder="Nombre de la lista (ej: Penosil, Shopify)"/>
          <button type="submit" className="primary"><Plus size={16}/> Agregar lista</button>
        </form>
      </section>
      <div className="board-lists">
        {orderedLists.map((list) => (
          <div
            className="board-list"
            key={list.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(list.id, null)}
          >
            <div className="board-list-head">
              <strong>{list.title}</strong>
              <button type="button" className="icon-button" onClick={() => { if (window.confirm(`¿Eliminar la lista "${list.title}" y sus tarjetas?`)) onDeleteList(list.id); }} aria-label="Eliminar lista">
                <Trash2 size={14}/>
              </button>
            </div>
            <div className="board-cards">
              {cardsFor(list.id).map((card) => (
                <div
                  className="board-card"
                  key={card.id}
                  draggable
                  onDragStart={() => setDraggingCardId(card.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); handleDrop(list.id, card.id); }}
                  onClick={() => setEditingCard(card)}
                >
                  <GripVertical size={14} className="board-card-grip"/>
                  <div>
                    {card.tag && <span className="board-card-tag" style={{ background: tagColor(card.tag) }}>{card.tag}</span>}
                    <p>{card.title}</p>
                    {card.dueDate && <span className="board-card-date">{card.dueDate}</span>}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="board-add-card" onClick={() => setEditingCard({ listId: list.id, title: '', description: '', tag: '', dueDate: '' })}>
              <Plus size={14}/> Tarjeta
            </button>
          </div>
        ))}
        {!orderedLists.length && (
          <div className="empty-opportunities"><LayoutGrid/><p>Todavía no creaste ninguna lista. Empezá con una arriba.</p></div>
        )}
      </div>
      {editingCard && (
        <CardModal
          value={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={(card) => {
            onSaveCard({
              ...card,
              id: card.id || crypto.randomUUID(),
              order: card.id ? card.order : nextOrder(cardsFor(card.listId)),
              createdAt: card.createdAt || new Date().toISOString(),
            });
            setEditingCard(null);
          }}
          onDelete={editingCard.id ? () => { onDeleteCard(editingCard.id); setEditingCard(null); } : null}
        />
      )}
    </div>
  );
}

function CardModal({ value, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(value);
  const update = (name, val) => setForm((current) => ({ ...current, [name]: val }));
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={(event) => { event.preventDefault(); if (form.title.trim()) onSave({ ...form, title: form.title.trim() }); }}>
        <div className="modal-head">
          <div><span className="eyebrow">Tarjeta</span><h2>{value.id ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><X/></button>
        </div>
        <div className="form-grid">
          <label className="span-2">Título<input required value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="Ej: Subir catálogo de Easy Spray a Shopify"/></label>
          <label>Etiqueta<input value={form.tag || ''} onChange={(e) => update('tag', e.target.value)} placeholder="Penosil, Marketplace, Shopify…" list="board-tag-options"/>
            <datalist id="board-tag-options">{Object.keys(TAG_COLORS).filter(Boolean).map((tag) => <option key={tag} value={tag}/>)}</datalist>
          </label>
          <label>Fecha<input type="date" value={form.dueDate || ''} onChange={(e) => update('dueDate', e.target.value)}/></label>
          <label className="span-2">Notas<textarea value={form.description || ''} onChange={(e) => update('description', e.target.value)}/></label>
        </div>
        <div className="modal-actions">
          {onDelete && <button type="button" className="danger-link" onClick={onDelete}><Trash2 size={15}/> Eliminar tarjeta</button>}
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button className="primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

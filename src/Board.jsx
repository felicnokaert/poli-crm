import { useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical, LayoutGrid, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { KANBAN_TEMPLATE } from './board-model.mjs';

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

export default function Board({ lists, cards, onSaveList, onDeleteList, onReorderList, onSaveCard, onDeleteCard, onMoveCard }) {
  const [addingListTitle, setAddingListTitle] = useState('');
  const [editingCard, setEditingCard] = useState(null);
  const [draggingCardId, setDraggingCardId] = useState(null);
  const orderedLists = [...lists].sort((a, b) => (a.order || 0) - (b.order || 0));

  function addList(event) {
    event.preventDefault();
    if (!addingListTitle.trim()) return;
    onSaveList({ id: crypto.randomUUID(), title: addingListTitle.trim(), order: nextOrder(lists), wipLimit: 0 });
    setAddingListTitle('');
  }

  function applyTemplate() {
    KANBAN_TEMPLATE.forEach((title, index) => {
      onSaveList({ id: crypto.randomUUID(), title, order: nextOrder(lists) + index, wipLimit: title === 'En Proceso' ? 3 : 0 });
    });
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
            <p>Todo lo que no es venta directa: Penosil, Marketplace, catálogo, Mercado Libre, Shopify, lo que necesites. Creá tus propias listas y arrastrá las tarjetas, o usá tarjeta por tarjeta el selector "Mover a" si preferís no arrastrar.</p>
          </div>
          <LayoutGrid size={22} />
        </div>
        <form className="board-add-list" onSubmit={addList}>
          <input value={addingListTitle} onChange={(e) => setAddingListTitle(e.target.value)} placeholder="Nombre de la lista (ej: Penosil, Shopify)"/>
          <button type="submit" className="primary"><Plus size={16}/> Agregar lista</button>
          {!lists.length && <button type="button" className="secondary" onClick={applyTemplate}><Sparkles size={16}/> Usar plantilla kanban</button>}
        </form>
      </section>
      <div className="board-lists">
        {orderedLists.map((list, index) => {
          const listCards = cardsFor(list.id);
          const overLimit = list.wipLimit > 0 && listCards.length > list.wipLimit;
          return (
            <div
              className="board-list"
              key={list.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(list.id, null)}
            >
              <div className="board-list-head">
                <strong>{list.title}</strong>
                <div className="board-list-controls">
                  <button type="button" className="icon-button" disabled={index === 0} onClick={() => onReorderList(list.id, -1)} aria-label="Mover lista a la izquierda"><ChevronLeft size={14}/></button>
                  <button type="button" className="icon-button" disabled={index === orderedLists.length - 1} onClick={() => onReorderList(list.id, 1)} aria-label="Mover lista a la derecha"><ChevronRight size={14}/></button>
                  <button type="button" className="icon-button" onClick={() => { if (window.confirm(`¿Eliminar la lista "${list.title}" y sus tarjetas?`)) onDeleteList(list.id); }} aria-label="Eliminar lista">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
              <label className="board-wip-limit">
                Límite WIP
                <input
                  type="number"
                  min="0"
                  value={list.wipLimit || ''}
                  placeholder="sin límite"
                  onChange={(e) => onSaveList({ ...list, wipLimit: Number(e.target.value) || 0 })}
                />
              </label>
              {overLimit && (
                <p className="form-warning board-wip-warning"><AlertTriangle size={13}/> {listCards.length} tarjetas, límite {list.wipLimit}</p>
              )}
              <div className="board-cards">
                {listCards.map((card) => (
                  <div
                    className="board-card"
                    key={card.id}
                    draggable
                    onDragStart={() => setDraggingCardId(card.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); handleDrop(list.id, card.id); }}
                  >
                    <GripVertical size={14} className="board-card-grip"/>
                    <div>
                      <div onClick={() => setEditingCard(card)}>
                        {card.tag && <span className="board-card-tag" style={{ background: tagColor(card.tag) }}>{card.tag}</span>}
                        <p>{card.title}</p>
                        {card.dueDate && <span className="board-card-date">{card.dueDate}</span>}
                      </div>
                      {orderedLists.length > 1 && (
                        <select
                          className="board-card-move"
                          value={list.id}
                          onChange={(e) => onMoveCard(card.id, e.target.value, null)}
                          aria-label="Mover tarjeta a otra lista"
                        >
                          {orderedLists.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="board-add-card" onClick={() => setEditingCard({ listId: list.id, title: '', description: '', tag: '', dueDate: '' })}>
                <Plus size={14}/> Tarjeta
              </button>
            </div>
          );
        })}
        {!orderedLists.length && (
          <div className="empty-opportunities"><LayoutGrid/><p>Todavía no creaste ninguna lista. Empezá con una arriba o usá la plantilla.</p></div>
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

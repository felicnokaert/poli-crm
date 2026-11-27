import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3, BellRing, Bot, CirclePause, Clock, FileText, GripVertical, LayoutGrid, ListChecks, Pencil, Plus,
  Radar, RefreshCw, RotateCcw, Search, Sun, Truck, X,
} from "lucide-react";
import { HOME_BLOCKS, suggestBlocks } from "./home-layout.mjs";

// Inicio como widgets (27/11, Felipe: «Ordenar mi Inicio muy feo; poder seleccionar las boxes, tocar una cruz, moverlas,
// ver cuál agregar»). Editar = cada tarjeta con manija para arrastrar (mouse o dedo) y X para quitar; «+ Agregar» abre
// una galería con buscador; «Listo» guarda. Teclado: en la manija, flechas arriba/abajo mueven la tarjeta.

export const BLOCK_ICONS = {
  miDia: Sun, plan: ListChecks, metricas: BarChart3, atender: BellRing, atrasados: Clock, alertas: Radar,
  semana: FileText, automatico: Bot, logistica: Truck, pausa: CirclePause, conexiones: RefreshCw,
};
const blockOf = (id) => HOME_BLOCKS.find((block) => block.id === id) || { id, label: id };
const reducedMotion = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return true; }
};

export function HomeEditBar({ editing, onStart, onDone, onCancel, onReset, onOpenGallery, addableCount = 0 }) {
  if (!editing) {
    return (
      <div className="home-edit-entry">
        <button type="button" className="ghost home-edit-start" onClick={onStart}><Pencil size={15} /> Editar Inicio</button>
      </div>
    );
  }
  return (
    <div className="home-edit-bar" role="toolbar" aria-label="Editar Inicio">
      <div className="home-edit-copy">
        <strong>Editando tu Inicio</strong>
        <span>Arrastrá desde <GripVertical size={14} aria-hidden="true" /> para mover y tocá <X size={13} aria-hidden="true" /> para quitar.</span>
      </div>
      <div className="home-edit-actions">
        <button type="button" className="secondary" onClick={onOpenGallery}><Plus size={15} /> Agregar{addableCount ? ` (${addableCount})` : ""}</button>
        <button type="button" className="ghost" onClick={onReset} title="Volver a como venía de fábrica" aria-label="Restablecer: volver a como venía de fábrica"><RotateCcw size={15} /><span className="home-edit-reset-label"> Restablecer</span></button>
        <button type="button" className="ghost" onClick={onCancel}>Cancelar</button>
        <button type="button" className="primary" onClick={onDone}>Listo</button>
      </div>
    </div>
  );
}

// Animación al reacomodar (FLIP): cada tarjeta se desliza de donde estaba a donde quedó.
function useFlip(ids, refs) {
  const last = useRef(new Map());
  useLayoutEffect(() => {
    const now = new Map();
    for (const id of ids) {
      const node = refs.current.get(id);
      if (node) now.set(id, node.getBoundingClientRect().top);
    }
    if (!reducedMotion()) {
      for (const [id, top] of now) {
        const before = last.current.get(id);
        const node = refs.current.get(id);
        if (before == null || !node?.animate || Math.abs(before - top) < 2) continue;
        node.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" });
      }
    }
    last.current = now;
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function WidgetBoard({ ids, render, onRemove, onReorder, onMove }) {
  const refs = useRef(new Map());
  const [dragId, setDragId] = useState(null);
  const handles = useRef(new Map());
  useFlip(ids, refs);

  const pointerDown = (id) => (event) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* sin captura: sigue igual */ }
    setDragId(id);
  };
  const pointerMove = (id) => (event) => {
    if (dragId !== id) return;
    const { clientX: x, clientY: y } = event;
    if (y < 70) window.scrollBy(0, -14);
    else if (y > window.innerHeight - 70) window.scrollBy(0, 14);
    const over = document.elementFromPoint(x, y)?.closest?.("[data-widget]");
    const target = over?.dataset?.widget;
    if (!target || target === id) return;
    const rect = over.getBoundingClientRect();
    onReorder(id, target, y < rect.top + rect.height / 2 ? "before" : "after");
  };
  const pointerUp = () => setDragId(null);
  const keyDown = (id) => (event) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onMove(id, event.key === "ArrowUp" ? -1 : 1);
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  };

  if (!ids.length) return <p className="muted home-board-empty">Tu Inicio quedó vacío. Tocá «Agregar» para sumar tarjetas.</p>;
  return (
    <div className={`home-board${dragId ? " is-dragging" : ""}`}>
      {ids.map((id) => {
        const block = blockOf(id);
        const Icon = BLOCK_ICONS[id] || LayoutGrid;
        const content = render(id);
        return (
          <div
            key={id}
            data-widget={id}
            ref={(node) => { if (node) refs.current.set(id, node); else refs.current.delete(id); }}
            className={`home-widget${dragId === id ? " is-lifted" : ""}`}
          >
            <div className="home-widget-bar">
              <button
                type="button"
                className="home-widget-handle"
                ref={(node) => { if (node) handles.current.set(id, node); else handles.current.delete(id); }}
                aria-label={`Mover «${block.label}» (flechas arriba y abajo)`}
                onPointerDown={pointerDown(id)}
                onPointerMove={pointerMove(id)}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                onKeyDown={keyDown(id)}
              >
                <GripVertical size={18} />
              </button>
              <Icon size={16} aria-hidden="true" className="home-widget-icon" />
              <span className="home-widget-name">{block.label}</span>
              <button type="button" className="home-widget-remove" aria-label={`Quitar «${block.label}» del Inicio`} onClick={() => onRemove(id)}><X size={16} /></button>
            </div>
            <div className="home-widget-body" aria-hidden="true" inert>
              {content || <p className="muted small home-widget-placeholder">{block.desc ? `${block.desc} ` : ""}Aparece cuando hay algo para mostrar.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WidgetGallery({ open, blocks, onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const input = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    const timer = setTimeout(() => input.current?.focus(), 30);
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  const shown = useMemo(() => suggestBlocks(query, blocks), [query, blocks]);
  if (!open) return null;
  return (
    <div className="widget-gallery-backdrop" onClick={onClose}>
      <section className="widget-gallery" role="dialog" aria-modal="true" aria-label="Agregar al Inicio" onClick={(event) => event.stopPropagation()}>
        <header className="widget-gallery-head">
          <div><span className="eyebrow">Tu Inicio</span><h2>Agregar tarjetas</h2></div>
          <button type="button" className="ghost icon-only" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </header>
        <label className="search widget-gallery-search">
          <Search size={16} />
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="¿Qué querés ver en tu Inicio? (ej. entregas, metas, clientes)" aria-label="¿Qué querés ver en tu Inicio?" />
        </label>
        {!blocks.length ? (
          <p className="muted">Ya tenés todas las tarjetas que podés ver.</p>
        ) : !shown.length ? (
          <p className="muted">No encontré nada con eso. Probá con «entregas», «clientes» o «números».</p>
        ) : (
          <ul className="widget-gallery-list">
            {shown.map((block) => {
              const Icon = BLOCK_ICONS[block.id] || LayoutGrid;
              return (
                <li key={block.id}>
                  <button type="button" className="widget-option" onClick={() => onAdd(block.id)}>
                    <span className="widget-option-icon"><Icon size={20} /></span>
                    <span className="widget-option-text"><strong>{block.label}</strong><small>{block.desc}</small></span>
                    <span className="widget-option-add"><Plus size={16} /> Agregar</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

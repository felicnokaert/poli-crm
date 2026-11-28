// Paginador común (28/11, Felipe: «en vez de listas interminables, listas cortas por páginas 1, 2, 3»).
// usePaged(lista, tamaño, clave) corta la lista y vuelve a la página 1 cuando cambia la clave (filtros, búsqueda).
// <Pager paged={…} /> muestra «Mostrando 1–25 de 149» y los números de página; no se ve si entra todo en una.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE, pageWindow, paginate } from "./pager.mjs";

export { PAGE_SIZE, pageWindow, paginate };

export function usePaged(list = [], size = PAGE_SIZE, resetKey = "") {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const result = useMemo(() => paginate(list, page, size), [list, page, size]);
  return { ...result, setPage };
}

export function Pager({ paged, label = "", top = false }) {
  if (!paged || paged.pages <= 1) return null;
  const go = (number) => {
    paged.setPage(number);
    if (!top) {
      try { document.activeElement?.closest?.(".panel, section")?.scrollIntoView({ block: "start", behavior: "smooth" }); } catch { /* sin scroll */ }
    }
  };
  return (
    <nav className="pager" aria-label="Páginas">
      <span className="pager-info small muted">Mostrando {paged.from}–{paged.to} de {paged.total}{label ? ` ${label}` : ""}</span>
      <div className="pager-buttons">
        <button type="button" className="pager-btn" disabled={paged.page <= 1} onClick={() => go(paged.page - 1)} aria-label="Página anterior"><ChevronLeft size={15} /></button>
        {pageWindow(paged.page, paged.pages).map((item, index) => item === "…"
          ? <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">…</span>
          : <button key={item} type="button" className={`pager-btn${item === paged.page ? " is-current" : ""}`} aria-current={item === paged.page ? "page" : undefined} onClick={() => go(item)}>{item}</button>)}
        <button type="button" className="pager-btn" disabled={paged.page >= paged.pages} onClick={() => go(paged.page + 1)} aria-label="Página siguiente"><ChevronRight size={15} /></button>
      </div>
    </nav>
  );
}

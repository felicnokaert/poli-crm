import { useEffect, useMemo, useState } from "react";
import { productMlSheet, sheetText } from "./product-ml-sheet.mjs";

// Base técnica → Catálogo ↔ Mercado Libre → "Descripción y preguntas" (23/10): por producto vinculado por SKU,
// la descripción de la publicación que más vendió y las preguntas frecuentes con la respuesta que más
// repetimos. Botón para copiar y pegar en Shopify o en la ficha del cotizador. Solo lee.
const CHUNK = 100;
const PAGE = 1000;
const SHOW = 40;

async function loadSheetsData(supabase, ids) {
  const descriptions = {};
  const questions = [];
  for (let index = 0; index < ids.length; index += CHUNK) {
    const slice = ids.slice(index, index + CHUNK);
    const { data, error } = await supabase.from("ml_items").select("id,description").in("id", slice);
    if (error) throw error;
    for (const row of data || []) descriptions[row.id] = row.description || "";
    for (let from = 0; ; from += PAGE) {
      const { data: page, error: questionsError } = await supabase.from("ml_questions").select("item_id,question,answer").in("item_id", slice).order("id").range(from, from + PAGE - 1);
      if (questionsError) throw questionsError;
      questions.push(...(page || []));
      if (!page || page.length < PAGE) break;
    }
  }
  return { descriptions, questions };
}

export function MlProductSheets({ supabase, entries = [], search = "" }) {
  const ids = useMemo(() => [...new Set(entries.flatMap((entry) => entry.items.map((item) => item.id)))], [entries]);
  const [state, setState] = useState({ status: "loading", descriptions: {}, questions: [] });
  const [shown, setShown] = useState(SHOW);
  const [copied, setCopied] = useState("");
  const [onlyFaq, setOnlyFaq] = useState(false);
  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, status: "loading" }));
    loadSheetsData(supabase, ids)
      .then((data) => { if (alive) setState({ status: "ready", ...data }); })
      .catch(() => { if (alive) setState({ status: "error", descriptions: {}, questions: [] }); });
    return () => { alive = false; };
  }, [supabase, ids]);

  const sheets = useMemo(() => {
    if (state.status !== "ready") return [];
    const needle = search.trim().toLowerCase();
    return entries
      .filter((entry) => entry.product)
      .filter((entry) => !needle || `${entry.sku} ${entry.product.name}`.toLowerCase().includes(needle))
      .map((entry) => ({ entry, sheet: productMlSheet({ items: entry.items, questions: state.questions, descriptions: state.descriptions }) }))
      .filter(({ sheet }) => (onlyFaq ? sheet.faq.length : sheet.description || sheet.faq.length))
      .sort((a, b) => b.sheet.faq.length - a.sheet.faq.length || String(a.entry.product.name).localeCompare(String(b.entry.product.name)));
  }, [state, entries, search, onlyFaq]);

  async function copy(entry, sheet) {
    try {
      await navigator.clipboard.writeText(sheetText(entry.product.name, sheet));
      setCopied(entry.sku);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }

  if (state.status === "loading") return <p className="muted" role="status">Leyendo descripciones y preguntas de Mercado Libre…</p>;
  if (state.status === "error") return <p className="muted">No se pudieron leer las descripciones o las preguntas.</p>;
  return (
    <>
      <p className="muted small">
        Descripción de la publicación que más vendió y las preguntas que más nos hacen, con la respuesta que más repetimos. Copiala para pegar en Shopify o en la ficha del cotizador:
        revisala antes, porque la descripción de ML puede hablar de envíos o de la publicación.
      </p>
      <label className="small"><input type="checkbox" checked={onlyFaq} onChange={(event) => setOnlyFaq(event.target.checked)} /> Solo los que tienen preguntas frecuentes</label>
      <p className="muted small">{sheets.length} productos con algo para copiar.</p>
      <div className="ml-sheets">
        {sheets.slice(0, shown).map(({ entry, sheet }) => (
          <article key={entry.sku} className="ml-sheet">
            <header>
              <strong>{entry.product.name}</strong>
              <span className="muted small"> · {entry.sku}{sheet.sourceItem ? ` · descripción de "${String(sheet.sourceItem.title || "").slice(0, 50)}"` : ""}</span>
            </header>
            {sheet.description && (
              <details>
                <summary>Descripción ({sheet.description.length} caracteres)</summary>
                <p className="ml-sheet-text">{sheet.description}</p>
              </details>
            )}
            {sheet.faq.length > 0 && (
              <ul className="ml-sheet-faq">
                {sheet.faq.map((item) => (
                  <li key={item.key}>
                    <span className="muted small">{item.label} · {item.asked} preguntas{item.uses ? `, respondido igual ${item.uses} veces` : ""}</span>
                    <div><strong>{item.question}</strong></div>
                    <div>{item.answer}</div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="secondary" onClick={() => copy(entry, sheet)}>{copied === entry.sku ? "Copiado ✓" : "Copiar ficha"}</button>
          </article>
        ))}
      </div>
      {sheets.length > shown && <button type="button" className="secondary" onClick={() => setShown((count) => count + SHOW)}>Ver {Math.min(SHOW, sheets.length - shown)} más ({shown} de {sheets.length})</button>}
    </>
  );
}

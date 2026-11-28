// Arreglar en tanda (28/11): descripciones y fotos que faltan, copiadas de otra publicación nuestra con el mismo SKU.
// Solo administradores. Nada se aplica solo: se elige y se confirma. Ver lib/ml-fix.mjs.
import { useState } from "react";
import { Wand2 } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { AccountTag } from "./MlAccountTag.jsx";

const LOTE = 10;

export function MlFixPanel({ session, nickname = {} }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("descriptions");

  async function call(body) {
    const response = await adminFetch({ action: "mercadolibre", ...body }, session?.access_token);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
    return json;
  }

  async function load() {
    setBusy("Buscando…"); setMessage("");
    try { setPlan(await call({ op: "fix-propose" })); } catch (error) { setMessage(error.message); }
    setBusy("");
  }

  const rows = plan ? (kind === "photos" ? plan.photos : plan.descriptions) : [];
  const ready = rows.filter((row) => row.donor);

  async function apply() {
    const lote = ready.slice(0, LOTE);
    const what = kind === "photos" ? "fotos" : "descripción";
    if (!lote.length || !window.confirm(`Se va a copiar la ${what} en ${lote.length} publicaciones de Mercado Libre, tomándola de la publicación nuestra con el mismo SKU que más vendió. ¿Seguimos?`)) return;
    setBusy(`Aplicando ${lote.length}…`); setMessage("");
    try {
      const result = await call({ op: "fix-apply", kind, ids: lote.map((row) => row.id) });
      if (result.denied) setMessage("Mercado Libre no deja escribir: falta el permiso «Publicación y sincronización» en lectura y escritura en la app del CRM (developers.mercadolibre.com.ar) y reconectar las cuentas en Más → Datos → Mercado Libre.");
      else setMessage(`Listo: ${result.done.length} arregladas${result.failed.length ? ` · ${result.failed.length} con problema: ${result.failed.slice(0, 2).map((row) => `${row.id} (${row.error})`).join(" · ")}` : ""}.`);
      await load();
    } catch (error) { setMessage(error.message); setBusy(""); }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Solo administradores</span><h2><Wand2 size={16} /> Arreglar en tanda</h2></div>
        <button type="button" className="secondary" disabled={Boolean(busy)} onClick={load}>{busy || (plan ? "Volver a buscar" : "Buscar qué se puede arreglar")}</button>
      </div>
      <p className="muted small">Copia la descripción o las fotos de OTRA publicación nuestra con el mismo SKU (la que más vendió). No inventa textos; saca links, mails y teléfonos. Las publicaciones con variantes no se tocan en fotos.</p>
      {plan && (
        <>
          <div className="segmented" role="tablist" aria-label="Qué arreglar">
            <button type="button" role="tab" aria-selected={kind === "descriptions"} className={kind === "descriptions" ? "selected" : ""} onClick={() => setKind("descriptions")}>Sin descripción · {plan.counts.descriptionsReady} de {plan.counts.descriptions} se pueden copiar</button>
            <button type="button" role="tab" aria-selected={kind === "photos"} className={kind === "photos" ? "selected" : ""} onClick={() => setKind("photos")}>Menos de 3 fotos · {plan.counts.photosReady} de {plan.counts.photos}</button>
          </div>
          <div className="ml-toolbar">
            <span className="muted small">{ready.length} listas para copiar · el resto necesita texto o fotos nuevas.</span>
            <button type="button" className="primary" disabled={Boolean(busy) || !ready.length} onClick={apply}>Aplicar a las próximas {Math.min(LOTE, ready.length)}</button>
          </div>
          <ul className="ml-fix-list">
            {rows.slice(0, 40).map((row) => (
              <li key={row.id}>
                <AccountTag name={nickname[row.seller_id] || "cuenta"} /> <strong>{row.title}</strong> <span className="muted small">{row.id}{row.sku ? ` · ${row.sku}` : ""} · {row.sold} vendidas</span>
                <div className="small">
                  {row.donor
                    ? kind === "photos" ? `Suma ${row.add.length} fotos de «${row.donor.title}» (${row.donor.id})` : `Copia la descripción de «${row.donor.title}» (${row.donor.id}, ${row.chars} caracteres)`
                    : <span className="muted">{row.blocked || "No hay otra publicación con el mismo SKU para copiar: hay que escribirla o sacar fotos."}</span>}
                </div>
              </li>
            ))}
          </ul>
          {rows.length > 40 && <p className="muted small">Y {rows.length - 40} más.</p>}
        </>
      )}
      {message && <div className="system-message" role="status">{message}</div>}
    </section>
  );
}

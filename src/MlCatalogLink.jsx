import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { linkMlToCatalog, secureUrl } from "./ml-catalog-link.mjs";
import { MlProductSheets } from "./MlProductSheets.jsx";

// Catálogo del cotizador ↔ Mercado Libre, por SKU. Solo lectura: muestra qué publicaciones ya tienen su producto en el
// catálogo, de cuáles se podría tomar la foto, y qué SKU de ML todavía no están en el catálogo o se repiten.
const PAGE = 1000;
// Las que subió Claude para que Felipe las revise (approved_by empieza con "claude").
const unreviewed = (entry) => String(entry.approvedPhoto?.approved_by || "").toLowerCase().startsWith("claude");
const SHOW = 100;

async function readAll(supabase, table, columns, filter) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select(columns);
    if (filter) query = filter(query);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function Pub({ item, accounts, isPhotoSource }) {
  return (
    <span className="ml-link-pub">
      {item.thumbnail && <img src={secureUrl(item.thumbnail)} alt="" width="28" height="28" loading="lazy" style={{ objectFit: "cover", borderRadius: 4, marginRight: 6, verticalAlign: "middle" }} />}
      <a href={item.permalink} target="_blank" rel="noreferrer">{String(item.title || item.id).slice(0, 60)} <ExternalLink size={11} /></a>
      {isPhotoSource && <em className="badge ok"> foto de esta</em>}
      <span className="muted small"> · {accounts[item.seller_id] || "cuenta"}{item.sold_quantity != null ? ` · ${item.sold_quantity} vendidos` : ""}{item.visits_30d != null ? ` · ${item.visits_30d} visitas/30 días` : ""}</span>
    </span>
  );
}

export function MlCatalogLink({ supabase, isAdmin = false, userEmail = "" }) {
  const [state, setState] = useState({ status: supabase ? "loading" : "offline", raw: null, photos: [] });
  const [view, setView] = useState("foto");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(SHOW);
  const [accounts, setAccounts] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    (async () => {
      try {
        const [products, variants, items, photos] = await Promise.all([
          readAll(supabase, "catalog_products", "id,name,brand,family,photo_path,status"),
          readAll(supabase, "catalog_variants", "id,product_id,sku,name,active"),
          readAll(supabase, "ml_items", "id,seller_id,title,permalink,status,thumbnail,picture_url,sold_quantity,visits_30d,sku", (query) => query.eq("status", "active")),
          readAll(supabase, "catalog_product_photos", "product_id,url,item_id,sku,approved_by,approved_at"),
        ]);
        const { data: names } = await supabase.rpc("ml_account_names");
        if (!alive) return;
        setAccounts(Object.fromEntries((names || []).map((row) => [row.seller_id, row.nickname])));
        setState({ status: "ready", raw: { products: products.filter((item) => item.status !== "excluido"), variants, items }, photos });
      } catch {
        if (alive) setState({ status: "error", raw: null, photos: [] });
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  const link = useMemo(() => (state.raw ? linkMlToCatalog({ ...state.raw, photos: state.photos }) : null), [state.raw, state.photos]);
  const rows = useMemo(() => {
    if (!link) return [];
    const needle = search.trim().toLowerCase();
    const base = view === "foto" ? link.matched.filter((entry) => entry.needsPhoto)
      : view === "aprobadas" ? link.matched.filter((entry) => entry.approvedPhoto)
      : view === "sinrevisar" ? link.matched.filter(unreviewed)
      : view === "vinculados" ? link.matched
        : view === "sinCatalogo" ? link.unmatched
          : view === "repetidos" ? link.duplicated
            : link.noSku.map((item) => ({ sku: "", items: [item] }));
    if (!needle) return base;
    return base.filter((entry) => `${entry.sku} ${entry.product?.name || ""} ${entry.items.map((item) => item.title).join(" ")}`.toLowerCase().includes(needle));
  }, [link, view, search]);

  async function approve(entries) {
    const list = entries.filter((entry) => entry.needsPhoto && entry.product);
    if (!list.length || !isAdmin) return;
    setBusy(true); setMessage("");
    const now = new Date().toISOString();
    const rowsToSave = list.map((entry) => ({ product_id: entry.product.id, url: entry.photoUrl, source: "mercadolibre", item_id: entry.photoItemId, sku: entry.sku, approved_by: String(userEmail || ""), approved_at: now }));
    const { error } = await supabase.from("catalog_product_photos").upsert(rowsToSave, { onConflict: "product_id" });
    setBusy(false);
    if (error) { setMessage("No se pudo guardar la foto. Probá de nuevo."); return; }
    setState((current) => ({ ...current, photos: [...current.photos.filter((photo) => !rowsToSave.some((row) => row.product_id === photo.product_id)), ...rowsToSave] }));
    setMessage(list.length === 1 ? `Foto aprobada para ${list[0].product.name}.` : `Se aprobaron ${list.length} fotos.`);
  }

  async function remove(entry) {
    if (!isAdmin || !entry.product) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("catalog_product_photos").delete().eq("product_id", entry.product.id);
    setBusy(false);
    if (error) { setMessage("No se pudo quitar la foto."); return; }
    setState((current) => ({ ...current, photos: current.photos.filter((photo) => photo.product_id !== entry.product.id) }));
    setMessage(`Foto quitada de ${entry.product.name}.`);
  }

  if (state.status === "offline") return <p className="muted">Esta vista usa los datos en línea: entrá con tu cuenta.</p>;
  if (state.status === "loading") return <p className="muted">Cruzando el catálogo con Mercado Libre…</p>;
  if (state.status === "error") return <p className="muted">No se pudo leer el catálogo o las publicaciones de Mercado Libre.</p>;
  const summary = link.summary;
  const tabs = [
    ["foto", `Fotos para sumar (${summary.photoGain})`],
    ["sinrevisar", `Fotos sin revisar (${link.matched.filter(unreviewed).length})`],
    ["aprobadas", `Fotos aprobadas (${summary.photosApproved})`],
    ["vinculados", `Vinculados (${summary.matchedSkus})`],
    ["ficha", "Descripción y preguntas"],
    ["sinCatalogo", `SKU de ML sin producto (${summary.unmatchedSkus})`],
    ["repetidos", `SKU repetidos (${summary.duplicatedSkus})`],
    ["sinSku", `Publicaciones sin SKU (${summary.noSku})`],
  ];
  return (
    <section className="panel ml-catalog-link">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Catálogo del cotizador ↔ Mercado Libre</span>
          <h2>Mismo SKU, mismo producto</h2>
          <p className="muted">
            De {summary.activeItems} publicaciones activas, {summary.withSku} tienen SKU y {summary.matchedItems} ({summary.matchedSkus} SKU) ya están en el catálogo
            ({summary.catalogCovered} de los {summary.catalogSkus} SKU del catálogo se venden en ML). Solo se muestra: no se copia ni se cambia nada.
          </p>
        </div>
      </div>
      <div className="segmented" role="tablist" aria-label="Cruce con Mercado Libre" style={{ flexWrap: "wrap" }}>
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "selected" : ""} onClick={() => { setView(key); setShown(SHOW); }}>{label}</button>
        ))}
      </div>
      <input aria-label="Buscar por SKU o título" placeholder="Buscar por SKU o título" value={search} onChange={(event) => { setSearch(event.target.value); setShown(SHOW); }} />
      {view === "foto" && <p className="muted small">Productos del catálogo sin foto que sí tienen foto en alguna publicación de ML (la de la publicación que más vendió). {isAdmin ? "Aprobás una por una o varias juntas; no se toca ninguna foto que el catálogo ya tenga." : "Las aprueba un administrador."} Las aprobadas quedan guardadas aparte: el catálogo y el cotizador no cambian.</p>}
      {view === "aprobadas" && <p className="muted small">Fotos aprobadas desde Mercado Libre. Se pueden quitar.</p>}
      {view === "sinrevisar" && <p className="muted small">Fotos que subió Claude por coincidencia de SKU (la publicación que más vendió). Revisá que el título y la foto correspondan al producto; las que no, tocá "Quitar". El cotizador no las usa hasta que estén revisadas.</p>}
      {message && <p className="muted small" role="status">{message}</p>}
      {view === "foto" && isAdmin && rows.length > 0 && (
        <div className="panel-head-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => { if (window.confirm(`¿Aprobar las ${Math.min(rows.length, 25)} primeras fotos de esta lista? (Podés quitarlas después.)`)) approve(rows.slice(0, 25)); }}>Aprobar las {Math.min(rows.length, 25)} primeras</button>
        </div>
      )}
      {view === "sinCatalogo" && <p className="muted small">SKU que figuran en ML y no están en el catálogo del cotizador: pueden ser productos que faltan cargar, o SKU escritos distinto.</p>}
      {view === "repetidos" && <p className="muted small">El mismo SKU en más de una publicación (ML pide unificarlas).</p>}
      {view === "ficha" ? <MlProductSheets supabase={supabase} entries={link.matched} search={search} /> : rows.length === 0 ? <p className="muted">No hay nada en esta lista.</p> : (
        <div className="table-scroll">
          <table className="sales-history-table">
            <thead><tr><th>SKU</th><th>Producto del catálogo</th>{(view === "foto" || view === "aprobadas" || view === "sinrevisar") && <th>Foto</th>}<th>Publicaciones en Mercado Libre</th></tr></thead>
            <tbody>
              {rows.slice(0, shown).map((entry, index) => (
                <tr key={`${entry.sku}-${index}`}>
                  <td><strong>{entry.sku || "—"}</strong></td>
                  <td>{entry.product ? <>{entry.product.name}<br /><span className="muted small">{[entry.product.brand, entry.product.family].filter(Boolean).join(" · ")}{entry.product.photo_path ? " · ya tiene foto" : " · sin foto"}</span></> : <span className="muted">no está en el catálogo</span>}</td>
                  {(view === "foto" || view === "aprobadas" || view === "sinrevisar") && (
                    <td>
                      {(view !== "foto" ? entry.approvedPhoto?.url : entry.photoUrl) && <img src={view !== "foto" ? entry.approvedPhoto.url : entry.photoUrl} alt={`Foto de ${entry.product?.name || entry.sku}`} width="72" height="72" loading="lazy" style={{ objectFit: "cover", borderRadius: 6, display: "block" }} />}
                      {view === "foto" && entry.photoIsSmall && <span className="muted small">miniatura: la foto grande llega con la próxima actualización de Mercado Libre</span>}
                      {isAdmin && view === "foto" && <button type="button" className="secondary" disabled={busy} onClick={() => approve([entry])}>Usar esta foto</button>}
                      {isAdmin && view !== "foto" && <button type="button" className="secondary" disabled={busy} onClick={() => remove(entry)}>Quitar</button>}
                    </td>
                  )}
                  <td>{entry.items.slice(0, 4).map((item) => <div key={item.id}><Pub item={item} accounts={accounts} isPhotoSource={Boolean(entry.approvedPhoto) && entry.approvedPhoto.item_id === item.id} /></div>)}{entry.items.length > 4 && <span className="muted small">y {entry.items.length - 4} más</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view !== "ficha" && rows.length > shown && <button type="button" className="secondary" onClick={() => setShown((count) => count + SHOW)}>Ver {Math.min(SHOW, rows.length - shown)} más ({shown} de {rows.length})</button>}
    </section>
  );
}

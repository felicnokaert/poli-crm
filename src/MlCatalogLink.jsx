import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { linkMlToCatalog } from "./ml-catalog-link.mjs";

// Catálogo del cotizador ↔ Mercado Libre, por SKU. Solo lectura: muestra qué publicaciones ya tienen su producto en el
// catálogo, de cuáles se podría tomar la foto, y qué SKU de ML todavía no están en el catálogo o se repiten.
const PAGE = 1000;
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

function Pub({ item, accounts }) {
  return (
    <span className="ml-link-pub">
      {item.thumbnail && <img src={item.thumbnail} alt="" width="28" height="28" loading="lazy" style={{ objectFit: "cover", borderRadius: 4, marginRight: 6, verticalAlign: "middle" }} />}
      <a href={item.permalink} target="_blank" rel="noreferrer">{String(item.title || item.id).slice(0, 60)} <ExternalLink size={11} /></a>
      <span className="muted small"> · {accounts[item.seller_id] || "cuenta"}{item.sold_quantity != null ? ` · ${item.sold_quantity} vendidos` : ""}{item.visits_30d != null ? ` · ${item.visits_30d} visitas/30 días` : ""}</span>
    </span>
  );
}

export function MlCatalogLink({ supabase }) {
  const [state, setState] = useState({ status: supabase ? "loading" : "offline", data: null });
  const [view, setView] = useState("foto");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(SHOW);
  const [accounts, setAccounts] = useState({});

  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    (async () => {
      try {
        const [products, variants, items] = await Promise.all([
          readAll(supabase, "catalog_products", "id,name,brand,family,photo_path,status"),
          readAll(supabase, "catalog_variants", "id,product_id,sku,name,active"),
          readAll(supabase, "ml_items", "id,seller_id,title,permalink,status,thumbnail,sold_quantity,visits_30d,sku", (query) => query.eq("status", "active")),
        ]);
        const { data: names } = await supabase.rpc("ml_account_names");
        if (!alive) return;
        setAccounts(Object.fromEntries((names || []).map((row) => [row.seller_id, row.nickname])));
        setState({ status: "ready", data: linkMlToCatalog({ products: products.filter((item) => item.status !== "excluido"), variants, items }) });
      } catch {
        if (alive) setState({ status: "error", data: null });
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  const link = state.data;
  const rows = useMemo(() => {
    if (!link) return [];
    const needle = search.trim().toLowerCase();
    const base = view === "foto" ? link.matched.filter((entry) => entry.needsPhoto)
      : view === "vinculados" ? link.matched
        : view === "sinCatalogo" ? link.unmatched
          : view === "repetidos" ? link.duplicated
            : link.noSku.map((item) => ({ sku: "", items: [item] }));
    if (!needle) return base;
    return base.filter((entry) => `${entry.sku} ${entry.product?.name || ""} ${entry.items.map((item) => item.title).join(" ")}`.toLowerCase().includes(needle));
  }, [link, view, search]);

  if (state.status === "offline") return <p className="muted">Esta vista usa los datos en línea: entrá con tu cuenta.</p>;
  if (state.status === "loading") return <p className="muted">Cruzando el catálogo con Mercado Libre…</p>;
  if (state.status === "error") return <p className="muted">No se pudo leer el catálogo o las publicaciones de Mercado Libre.</p>;
  const summary = link.summary;
  const tabs = [
    ["foto", `Fotos para sumar (${summary.photoGain})`],
    ["vinculados", `Vinculados (${summary.matchedSkus})`],
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
      {view === "foto" && <p className="muted small">Productos del catálogo sin foto que sí tienen foto en alguna publicación de ML (se mostraría la de la publicación que más vendió).</p>}
      {view === "sinCatalogo" && <p className="muted small">SKU que figuran en ML y no están en el catálogo del cotizador: pueden ser productos que faltan cargar, o SKU escritos distinto.</p>}
      {view === "repetidos" && <p className="muted small">El mismo SKU en más de una publicación (ML pide unificarlas).</p>}
      {rows.length === 0 ? <p className="muted">No hay nada en esta lista.</p> : (
        <div className="table-scroll">
          <table className="sales-history-table">
            <thead><tr><th>SKU</th><th>Producto del catálogo</th><th>Publicaciones en Mercado Libre</th></tr></thead>
            <tbody>
              {rows.slice(0, shown).map((entry, index) => (
                <tr key={`${entry.sku}-${index}`}>
                  <td><strong>{entry.sku || "—"}</strong></td>
                  <td>{entry.product ? <>{entry.product.name}<br /><span className="muted small">{[entry.product.brand, entry.product.family].filter(Boolean).join(" · ")}{entry.product.photo_path ? " · ya tiene foto" : " · sin foto"}</span></> : <span className="muted">no está en el catálogo</span>}</td>
                  <td>{entry.items.slice(0, 4).map((item) => <div key={item.id}><Pub item={item} accounts={accounts} /></div>)}{entry.items.length > 4 && <span className="muted small">y {entry.items.length - 4} más</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > shown && <button type="button" className="secondary" onClick={() => setShown((count) => count + SHOW)}>Ver {Math.min(SHOW, rows.length - shown)} más ({shown} de {rows.length})</button>}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ImagePlus, FolderUp } from "lucide-react";
import { IMAGE_EXT, filterProductsByText, matchPhotos, photoState, selectedByDefault, summarize } from "./photo-match.mjs";

// Carga masiva de fotos del catálogo (solo administradores): se eligen fotos sueltas o una carpeta, el CRM las empareja por
// SKU (nombre del archivo) o por nombre del producto, se revisa y se sube. Las fotos se achican a 1200 px, se guardan en el
// bucket product-photos y quedan en catalog_product_photos aprobadas por quien las sube; el cotizador las usa solo si el
// producto no tiene foto propia en el catálogo (catalog_products.photo_path no se toca).
const PAGE = 1000;
const BUCKET = "product-photos";
const MAX_SIDE = 1200;

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

// Achica a MAX_SIDE y pasa a WebP; si el navegador no puede, sube el archivo tal cual.
async function prepareImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
    if (blob && blob.size > 0) return { blob, ext: "webp", type: "image/webp" };
  } catch { /* se sube original */ }
  const ext = (file.name.match(IMAGE_EXT)?.[0] || ".jpg").slice(1).toLowerCase();
  return { blob: file, ext, type: file.type || "image/jpeg" };
}

const slug = (value) => String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "foto";
const STATUS = { exacto: ["SKU exacto", "ok"], probable: ["Por nombre", "warn"], ambiguo: ["Varios posibles", "warn"], sin: ["Sin coincidencia", ""], repetida: ["Repetida", ""], manual: ["Elegido a mano", "ok"] };
const label = (product, variants) => `${product.name}${variants.get(product.id) ? ` · ${variants.get(product.id)}` : ""}`;


// Una sola foto para muchos productos que se ven igual (todas las almohadas que no son cervicales, los polioles en tambor
// azul, los isocianatos en tambor rojo...): se filtra por palabras del nombre y/o familia, se tilda lo que va y se sube
// una vez. Mismas reglas que la carga por carpeta: no pisa fotos propias del catálogo.
function OnePhotoPanel({ supabase, data, photoByProduct, userEmail, onSaved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [text, setText] = useState("");
  const [exclude, setExclude] = useState("");
  const [family, setFamily] = useState("");
  const [subfamily, setSubfamily] = useState("");
  const [overrides, setOverrides] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const families = useMemo(() => [...new Set(data.products.map((product) => product.family).filter(Boolean))].sort(), [data.products]);
  const subfamilies = useMemo(() => [...new Set(data.products.filter((product) => !family || product.family === family).map((product) => product.subfamily).filter(Boolean))].sort(), [data.products, family]);
  const rows = useMemo(() => filterProductsByText(data.products, { text, exclude, family, subfamily }).map((product) => {
    const state = photoState(product, photoByProduct.get(product.id));
    return { product, state, locked: state === "propia" };
  }), [data.products, text, exclude, family, subfamily, photoByProduct]);
  const checked = (row) => !row.locked && (overrides[row.product.id] ?? ["sin-revisar", null].includes(row.state));
  const chosen = rows.filter(checked);

  function pickFile(event) {
    const picked = [...(event.target.files || [])].find((item) => IMAGE_EXT.test(item.name));
    event.target.value = "";
    if (!picked) { setMessage("Elegí una imagen (JPG, PNG o WebP)."); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(picked); setPreview(URL.createObjectURL(picked)); setMessage("");
  }

  async function save() {
    if (!file || !chosen.length) return;
    setBusy(true); setMessage("");
    try {
      const { blob, ext, type } = await prepareImage(file);
      const path = `crm-varios-${slug(text || family || "foto")}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const now = new Date().toISOString();
      const rowsToSave = chosen.map((row) => ({ product_id: row.product.id, url: urlData.publicUrl, source: "una-foto-varios", item_id: "", sku: "", approved_by: String(userEmail || ""), approved_at: now }));
      const { error } = await supabase.from("catalog_product_photos").upsert(rowsToSave, { onConflict: "product_id" });
      if (error) throw error;
      if (preview) URL.revokeObjectURL(preview);
      setFile(null); setPreview(""); setOverrides({});
      await onSaved(`La foto quedó en ${rowsToSave.length} producto${rowsToSave.length === 1 ? "" : "s"} y ya la usa el cotizador.`);
    } catch {
      setMessage("No se pudo subir la foto. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-one">
      <p className="muted small">Para productos que se ven igual. Elegí la foto, escribí palabras del nombre (por ejemplo <code>almohada</code>, y en "sacar" <code>cervical</code>) o elegí una familia, tildá los que van y subila una sola vez.</p>
      <div className="panel-head-actions">
        <label className="secondary file-pick"><ImagePlus size={15} /> Elegir la foto<input type="file" accept="image/*" hidden onChange={pickFile} /></label>
        {preview && <img src={preview} alt="Foto elegida" width="56" height="56" style={{ objectFit: "cover", borderRadius: 6 }} />}
      </div>
      <div className="photo-one-filters">
        <input aria-label="Palabras del nombre" placeholder="Palabras del nombre (ej. poliol)" value={text} onChange={(event) => { setText(event.target.value); setOverrides({}); }} />
        <input aria-label="Sacar los que tengan" placeholder="Sacar los que tengan… (ej. cervical)" value={exclude} onChange={(event) => { setExclude(event.target.value); setOverrides({}); }} />
        <select aria-label="Familia" value={family} onChange={(event) => { setFamily(event.target.value); setSubfamily(""); setOverrides({}); }}><option value="">Todas las familias</option>{families.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        <select aria-label="Subfamilia" value={subfamily} onChange={(event) => { setSubfamily(event.target.value); setOverrides({}); }}><option value="">Todas las subfamilias</option>{subfamilies.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </div>
      {message && <p className="muted small" role="status">{message}</p>}
      {rows.length === 0 ? <p className="muted small">Escribí una palabra o elegí una familia para ver los productos.</p> : (
        <>
          <p className="muted small">{rows.length} producto{rows.length === 1 ? "" : "s"} coinciden. Marcados: <strong>{chosen.length}</strong>.</p>
          <div className="panel-head-actions">
            <button type="button" className="primary" disabled={busy || !file || !chosen.length} onClick={save}>{busy ? "Subiendo…" : `Usar esta foto en ${chosen.length} producto${chosen.length === 1 ? "" : "s"}`}</button>
          </div>
          <ul className="photo-one-list">
            {rows.slice(0, 300).map((row) => (
              <li key={row.product.id}>
                <label>
                  <input type="checkbox" disabled={row.locked || busy} checked={checked(row)} onChange={(event) => setOverrides((current) => ({ ...current, [row.product.id]: event.target.checked }))} />
                  {" "}{row.product.name}
                  <span className="muted small"> · {[row.product.family, row.product.subfamily].filter(Boolean).join(" › ")}{row.state === "propia" ? " · ya tiene foto propia (no se reemplaza)" : row.state === "aprobada" ? " · ya tiene foto aprobada: marcalo para reemplazar" : row.state === "sin-revisar" ? " · reemplaza la foto sin revisar" : " · sin foto"}</span>
                </label>
              </li>
            ))}
          </ul>
          {rows.length > 300 && <p className="muted small">Se muestran los primeros 300; afiná el filtro para ver el resto.</p>}
        </>
      )}
    </div>
  );
}

export function PhotoBulkUpload({ supabase, isAdmin = false, userEmail = "" }) {
  const [data, setData] = useState({ status: supabase ? "loading" : "offline", products: [], variants: [], photos: [] });
  const [rows, setRows] = useState([]);
  const [picks, setPicks] = useState({});
  const [overrides, setOverrides] = useState({});
  const [search, setSearch] = useState({});
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("carpeta");

  async function load() {
    const [products, variants, photos] = await Promise.all([
      readAll(supabase, "catalog_products", "id,name,photo_path,status,family,subfamily"),
      readAll(supabase, "catalog_variants", "id,product_id,sku,active"),
      readAll(supabase, "catalog_product_photos", "product_id,url,approved_by"),
    ]);
    return { status: "ready", products: products.filter((product) => product.status !== "excluido"), variants, photos };
  }
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    load().then((result) => { if (alive) setData(result); }).catch(() => { if (alive) setData((current) => ({ ...current, status: "error" })); });
    return () => { alive = false; };
  }, [supabase]);

  const firstSku = useMemo(() => { const map = new Map(); for (const variant of data.variants) if (!map.has(variant.product_id)) map.set(variant.product_id, variant.sku); return map; }, [data.variants]);
  const productById = useMemo(() => new Map(data.products.map((product) => [product.id, product])), [data.products]);
  const photoByProduct = useMemo(() => new Map(data.photos.map((photo) => [photo.product_id, photo])), [data.photos]);
  const options = useMemo(() => data.products.filter((product) => !String(product.photo_path || "").trim()).map((product) => ({ id: product.id, text: label(product, firstSku) })), [data.products, firstSku]);
  const textToProduct = useMemo(() => new Map(options.map((option) => [option.text, option.id])), [options]);

  function pick(event) {
    const files = [...(event.target.files || [])].filter((file) => IMAGE_EXT.test(file.name) && !file.name.startsWith("."));
    event.target.value = "";
    if (!files.length) { setMessage("No encontré imágenes (JPG, PNG, WebP) en lo que elegiste."); return; }
    rows.forEach((row) => row.preview && URL.revokeObjectURL(row.preview));
    const matched = matchPhotos(files.map((file) => ({ name: file.webkitRelativePath || file.name, file })), data).map((row) => ({ ...row, preview: URL.createObjectURL(row.file.file) }));
    setRows(matched);
    setPicks(Object.fromEntries(matched.map((row, index) => [index, selectedByDefault(row)])));
    setOverrides({}); setSearch({}); setMessage("");
  }

  // Producto efectivo de cada fila: el elegido a mano manda sobre el emparejado.
  const view = rows.map((row, index) => {
    const product = overrides[index] ? productById.get(overrides[index]) : row.product;
    const state = product ? photoState(product, photoByProduct.get(product.id)) : null;
    const status = overrides[index] ? "manual" : row.status;
    return { ...row, index, product, state, status, locked: state === "propia" };
  });
  const chosen = view.filter((row) => picks[row.index] && row.product && !row.locked);
  const counts = summarize(rows);

  async function upload() {
    if (!chosen.length || !isAdmin) return;
    setBusy(true); setMessage("");
    const saved = []; const failed = [];
    for (const [i, row] of chosen.entries()) {
      setProgress(`Subiendo ${i + 1} de ${chosen.length}: ${row.name}`);
      try {
        const { blob, ext, type } = await prepareImage(row.file.file);
        const path = `crm-${slug(row.sku || row.product.name)}-${Date.now()}-${i}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        saved.push({ product_id: row.product.id, url: urlData.publicUrl, source: "carga-masiva", item_id: "", sku: row.sku || firstSku.get(row.product.id) || "", approved_by: String(userEmail || ""), approved_at: new Date().toISOString() });
      } catch { failed.push(row.name); }
    }
    setProgress("");
    if (saved.length) {
      const { error } = await supabase.from("catalog_product_photos").upsert(saved, { onConflict: "product_id" });
      if (error) { setBusy(false); setMessage("Las fotos se subieron pero no se pudieron vincular a los productos. Probá de nuevo."); return; }
    }
    setBusy(false);
    setMessage(`Se subieron ${saved.length} fotos y ya las usa el cotizador.${failed.length ? ` No se pudieron subir ${failed.length}: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}.` : ""}`);
    rows.forEach((row) => row.preview && URL.revokeObjectURL(row.preview));
    setRows([]); setPicks({}); setOverrides({});
    try { setData(await load()); } catch { /* se actualiza al volver a entrar */ }
  }

  if (data.status === "offline") return <p className="muted">Esta vista usa los datos en línea: entrá con tu cuenta.</p>;
  if (data.status === "loading") return <p className="muted">Leyendo el catálogo…</p>;
  if (data.status === "error") return <p className="muted">No se pudo leer el catálogo.</p>;
  if (!isAdmin) return <p className="muted">La carga de fotos la hacen los administradores.</p>;
  const withoutPhoto = data.products.filter((product) => !String(product.photo_path || "").trim() && !photoByProduct.has(product.id)).length;
  return (
    <section className="panel photo-bulk">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Catálogo del cotizador</span>
          <h2>Subir fotos de productos</h2>
          <p className="muted">Elegí fotos sueltas o una carpeta entera. Se emparejan por el <strong>SKU en el nombre del archivo</strong> (ej. <code>PM490.jpg</code>, <code>KT-740-1.png</code>) o, si no, por el nombre del producto. Antes de subir ves cada una y corregís lo dudoso. Hoy faltan fotos en {withoutPhoto} productos.</p>
        </div>
      </div>
      <div className="segmented" role="tablist" aria-label="Cómo subir las fotos" style={{ marginBottom: 12, width: "fit-content" }}>
        {[["carpeta", "Por carpeta (por SKU)"], ["una", "Una foto para varios productos"]].map(([key, text]) => (
          <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? "selected" : ""} onClick={() => setMode(key)}>{text}</button>
        ))}
      </div>
      {message && <p className="muted small" role="status">{message}</p>}
      {progress && <p className="muted small" role="status">{progress}</p>}
      {mode === "una" && <OnePhotoPanel supabase={supabase} data={data} photoByProduct={photoByProduct} userEmail={userEmail} onSaved={async (text) => { try { setData(await load()); } catch { /* se actualiza al volver a entrar */ } setMessage(text); }} />}
      {mode === "carpeta" && (<>
      <div className="panel-head-actions">
        <label className="secondary file-pick"><ImagePlus size={15} /> Elegir fotos<input type="file" accept="image/*" multiple hidden onChange={pick} /></label>
        <label className="secondary file-pick"><FolderUp size={15} /> Elegir una carpeta<input type="file" accept="image/*" multiple hidden webkitdirectory="" directory="" onChange={pick} /></label>
      </div>
      {rows.length > 0 && (
        <>
          <p className="muted small">
            {counts.total} fotos: {counts.exacto} por SKU, {counts.probable} por nombre, {counts.ambiguo} con varios posibles, {counts.sin} sin coincidencia{counts.repetida ? `, ${counts.repetida} repetidas` : ""}. Marcadas para subir: <strong>{chosen.length}</strong>.
          </p>
          <div className="panel-head-actions">
            <button type="button" className="primary" disabled={busy || !chosen.length} onClick={upload}>{busy ? "Subiendo…" : `Subir ${chosen.length} foto${chosen.length === 1 ? "" : "s"}`}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPicks(Object.fromEntries(view.map((row) => [row.index, selectedByDefault(row) && !row.locked])))}>Marcar lo seguro</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setPicks({})}>Desmarcar todo</button>
          </div>
          <div className="table-scroll">
            <table className="sales-history-table">
              <thead><tr><th /><th>Foto</th><th>Archivo</th><th>Coincidencia</th><th>Producto</th></tr></thead>
              <tbody>
                {view.map((row) => {
                  const [text, tone] = STATUS[row.status] || STATUS.sin;
                  return (
                    <tr key={row.index}>
                      <td><input type="checkbox" aria-label={`Subir ${row.name}`} disabled={!row.product || row.locked || busy} checked={Boolean(picks[row.index] && row.product && !row.locked)} onChange={(event) => setPicks((current) => ({ ...current, [row.index]: event.target.checked }))} /></td>
                      <td><img src={row.preview} alt="" width="56" height="56" style={{ objectFit: "cover", borderRadius: 6, display: "block" }} /></td>
                      <td><span className="small">{row.name}</span></td>
                      <td><em className={`badge ${tone}`}>{text}</em>{row.duplicateOf && <><br /><span className="muted small">igual que {row.duplicateOf}</span></>}</td>
                      <td>
                        {row.product ? <>{row.product.name}<br /><span className="muted small">{row.sku || firstSku.get(row.product.id) || ""}{row.state === "propia" ? " · ya tiene foto propia en el catálogo (no se reemplaza)" : row.state === "aprobada" ? " · ya tiene foto aprobada: marcala para reemplazar" : row.state === "sin-revisar" ? " · reemplaza la foto sin revisar" : " · sin foto"}</span></> : <span className="muted small">sin producto</span>}
                        {!busy && (
                          <div>
                            <input list="photo-bulk-products" aria-label={`Elegir producto para ${row.name}`} placeholder={row.candidates.length ? "Elegir de la lista…" : "Buscar producto…"} value={search[row.index] ?? ""} onChange={(event) => {
                              const value = event.target.value;
                              setSearch((current) => ({ ...current, [row.index]: value }));
                              const id = textToProduct.get(value);
                              if (id) { setOverrides((current) => ({ ...current, [row.index]: id })); setPicks((current) => ({ ...current, [row.index]: true })); }
                            }} />
                            {row.candidates.length > 0 && !row.product && <span className="muted small"> Posibles: {row.candidates.map((candidate) => candidate.name).join(" · ")}</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <datalist id="photo-bulk-products">{options.map((option) => <option key={option.id} value={option.text} />)}</datalist>
        </>
      )}
      </>)}
    </section>
  );
}

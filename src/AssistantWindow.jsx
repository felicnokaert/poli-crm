import { answerHasGap } from "./assistant-training.mjs";
import { asksClient, clientCards, clientContext, clientWords } from "./assistant-client.mjs";
import { isRule, rapypFor, rulesContext } from "./assistant-rapyp.mjs";
import { asksBusiness, businessContext, businessFacts, businessLines } from "./assistant-business.mjs";
import { argentinaToday, useComprobantes } from "./CustomerBasePanel.jsx";
import { asksPrice, currentListPrices, priceLine, priceWords, pricesContext } from "./assistant-prices.mjs";
import { asksLearning, learningContext, prospectLearning, routeFor, routesContext, teamNotes, teamNotesContext } from "./assistant-team.mjs";
import { useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "./admin-api.mjs";
import { ChevronDown, Copy, GraduationCap, Search, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { AssistantLogo } from "./AssistantLogo.jsx";
import { KNOWLEDGE_TYPES } from "./knowledge-search.mjs";
import { buildAiContext, detectIntent, guideFacts, matchTaught, mlQuery, productWords, teamAnswer } from "./assistant-answer.mjs";
import { useKnowledge } from "./useKnowledge.js";
import { workspaceAnswer, workspaceContext } from "./assistant-workspace.mjs";
import { extraContext, purchaseLine, purchaseNameWords, purchaseSummary, rivalsFor } from "./assistant-extra.mjs";

// Ventana del asistente (21/10): flotante, abajo a la derecha (en el celular ocupa la pantalla). Por ahora
// busca por palabras en todo lo que sabe el CRM, sin IA ni costo. Cuando se apruebe el presupuesto, esta
// misma ventana pasa a conversar; lo que ve el equipo no cambia.
// 21/10: arriba va la respuesta concreta (src/assistant-answer.mjs); el resto queda en "Ver todo".
// "Enseñarle" (solo Felipe): la respuesta correcta queda en assistant_knowledge y va primero para todos.
// 👍/👎 de cualquiera quedan en assistant_feedback para que Felipe corrija.
// 22/10: sugerencias de asistente (hacer cosas), no solo de buscador.
const SUGGESTIONS = ["¿qué hago hoy?", "armame un mensaje para reactivar un cliente", "recordame llamar mañana a un cliente", "¿cuánto rinde el Easyspray?", "competidores de poliuretano", "¿a cuánto vendimos el kit x12 de Easyspray?"];

const isoToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // hora de Argentina
const dmyShort = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(String(iso || "")) ? String(iso).slice(0, 10).split("-").reverse().slice(0, 2).join("/") : String(iso || ""));

// Lo que la IA propone hacer: se guarda recién cuando la persona confirma.
function ActionCard({ action, onAction }) {
  const [state, setState] = useState("");
  const input = action.input || {};
  async function confirm() {
    setState("guardando");
    const result = await Promise.resolve(onAction ? onAction(action) : null).catch(() => null);
    setState(result?.ok ? "hecho" : `error:${result?.error || "No se pudo guardar."}`);
  }
  if (action.kind === "redactar_mensaje") {
    return (
      <div className="assistant-action">
        <span className="assistant-group-label">Mensaje{input.para ? ` para ${input.para}` : ""}</span>
        <p className="assistant-action-text">{input.texto}</p>
        <div className="assistant-answer-meta"><span className="muted small">Copialo y mandalo vos: el CRM no envía mensajes.</span><CopyButton text={input.texto} /></div>
      </div>
    );
  }
  if (action.kind === "guardar_respuesta") {
    return (
      <div className="assistant-action">
        <span className="assistant-group-label">Guardar en lo que sabe el asistente{input.producto ? ` · ${input.producto}` : ""}</span>
        <p className="assistant-action-text"><strong>{input.pregunta}</strong><br />{input.respuesta}</p>
        {state === "hecho" ? <span className="muted small">✓ Guardada. Desde ahora la usa para todo el equipo (si no sos Felipe, le llega para aprobar).</span> : state === "descartada" ? <span className="muted small">Descartada.</span> : (
          <div className="assistant-teach-actions">
            <button type="button" className="primary" disabled={state === "guardando" || !onAction} onClick={confirm}>Guardar respuesta</button>
            <button type="button" className="secondary" onClick={() => setState("descartada")}>Descartar</button>
            {state.startsWith("error:") && <span className="muted small">{state.slice(6)}</span>}
          </div>
        )}
      </div>
    );
  }
  const task = action.kind === "crear_tarea";
  return (
    <div className="assistant-action">
      <span className="assistant-group-label">{task ? "Tarea para agendar" : `Nota para ${input.empresa}`}</span>
      <p className="assistant-action-text">{task ? `${input.titulo}${input.empresa ? ` · ${input.empresa}` : ""} · vence ${dmyShort(input.fecha)}${input.prioridad && input.prioridad !== "Media" ? ` · prioridad ${input.prioridad}` : ""}` : input.nota}</p>
      {state === "hecho" ? <span className="muted small">✓ {task ? "Tarea creada: la ves en Tareas." : "Nota guardada en la ficha."}</span> : state === "descartada" ? <span className="muted small">Descartada.</span> : (
        <div className="assistant-teach-actions">
          <button type="button" className="primary" disabled={state === "guardando" || !onAction} onClick={confirm}>{task ? "Crear tarea" : "Guardar nota"}</button>
          <button type="button" className="secondary" onClick={() => setState("descartada")}>Descartar</button>
          {state.startsWith("error:") && <span className="muted small">{state.slice(6)}</span>}
        </div>
      )}
    </div>
  );
}

// Saludo con el día de la persona (sin IA ni costo).
export function dayBrief(tasks = [], today = isoToday()) {
  const open = tasks.filter((task) => task && !task.done && !task.deleted && task.kind !== "evento" && task.dueDate);
  const late = open.filter((task) => task.dueDate < today).length;
  const now = open.filter((task) => task.dueDate === today).length;
  if (!late && !now) return "No tenés tareas vencidas ni para hoy.";
  return `Hoy tenés ${now} tarea${now === 1 ? "" : "s"}${late ? ` y ${late} vencida${late === 1 ? "" : "s"}` : ""}. Preguntame "¿qué hago hoy?" y te armo el plan.`;
}
const PER_GROUP = 3;

// Las respuestas de Mercado Libre del tema y producto, con una pausa mientras se escribe.
// 22/10: devuelve también para qué búsqueda son las filas; si se pregunta antes de que lleguen (o son de
// lo escrito antes), submit las pide en el momento: así la IA no dice "no tengo el dato" teniéndolo.
function useTeamAnswer(supabase, query, intent) {
  const [state, setState] = useState({ q: "", rows: [] });
  const q = intent ? mlQuery(query, intent) : "";
  useEffect(() => {
    if (!supabase?.rpc || !q) { setState({ q, rows: [] }); return undefined; }
    let active = true;
    const timer = setTimeout(() => {
      supabase.rpc("search_ml_knowledge", { q, max_rows: 40 })
        .then(({ data, error }) => { if (active) setState({ q, rows: error ? [] : data || [] }); }, () => {});
    }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, q]);
  return { rows: state.q === q ? state.rows : [], ready: state.q === q, q };
}

// Precios de lista vigentes del catálogo del cotizador (22/10). Busca la variante por nombre o SKU; si no, el
// producto. Se usa en el hook (mientras se escribe) y en submit si todavía no llegó.
export async function loadListPrices(supabase, words, today) {
  if (!supabase?.from || !words.length) return [];
  const all = (request) => Promise.resolve(request).then(({ data }) => data || [], () => []);
  let variantsQuery = supabase.from("catalog_variants").select("id,sku,name,product_id,active").eq("active", true);
  for (const word of words) variantsQuery = variantsQuery.or(`name.ilike.%${word}%,sku.ilike.%${word}%`);
  let variants = await all(variantsQuery.limit(12));
  if (!variants.length) {
    for (const productWords of words.length > 1 ? [words, [words[0]]] : [words]) {
      let productQuery = supabase.from("catalog_products").select("id,name");
      for (const word of productWords) productQuery = productQuery.ilike("name", `%${word}%`);
      const products = await all(productQuery.limit(5));
      if (products.length) { variants = await all(supabase.from("catalog_variants").select("id,sku,name,product_id,active").eq("active", true).in("product_id", products.map((product) => product.id)).limit(12)); break; }
    }
  }
  if (!variants.length) return [];
  const [products, lists, prices] = await Promise.all([
    all(supabase.from("catalog_products").select("id,name").in("id", [...new Set(variants.map((variant) => variant.product_id))])),
    all(supabase.from("price_lists").select("id,name,currency,vat_rate,valid_from,valid_until,status")),
    all(supabase.from("variant_prices").select("price_list_id,variant_id,min_quantity,max_quantity,amount,status").in("variant_id", variants.map((variant) => variant.id))),
  ]);
  const productName = new Map(products.map((product) => [product.id, product.name]));
  const named = variants.map((variant) => {
    const base = productName.get(variant.product_id) || "";
    return { ...variant, name: base && !plainText(variant.name).includes(plainText(base)) ? `${base} · ${variant.name}` : variant.name };
  });
  return currentListPrices({ variants: named, prices, lists, today });
}
const plainText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function useListPrices(supabase, query) {
  // 23/10: "cuántas cotizaciones cerramos" es una pregunta de números, no de precios.
  const words = asksPrice(query) && !asksBusiness(query) ? priceWords(query) : [];
  const key = words.join(" ");
  const [state, setState] = useState({ key: "", entries: [] });
  useEffect(() => {
    if (!key) { setState({ key: "", entries: [] }); return undefined; }
    let active = true;
    const timer = setTimeout(() => { loadListPrices(supabase, key.split(" "), isoToday()).then((entries) => { if (active) setState({ key, entries }); }); }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, key]);
  return { key, words, entries: state.key === key ? state.entries : [], ready: state.key === key };
}

// Comprobantes de Contabilium del cliente nombrado ("cuándo compró X"), con una pausa mientras se escribe.
// 22/10: si la ficha tiene CUIT, primero por CUIT (fichas de Contabilium): encuentra las compras aunque la
// razón social de la factura no se parezca al nombre de la cartera.
function usePurchases(supabase, words = [], cuit = null) {
  const [rows, setRows] = useState([]);
  const key = words.join(" ");
  useEffect(() => {
    if (!supabase?.from || (!key && !cuit)) { setRows([]); return undefined; }
    let active = true;
    const columns = "company,tipo,numero,fecha,cliente,total,saldo";
    const byName = () => {
      if (!key) return Promise.resolve({ data: [] });
      let request = supabase.from("contabilium_comprobantes").select(columns);
      for (const word of key.split(" ")) request = request.ilike("cliente", `%${word}%`);
      return Promise.resolve(request.order("fecha", { ascending: false }).limit(300));
    };
    const byCuit = async () => {
      if (!cuit) return null;
      const { data: fichas, error } = await supabase.from("contabilium_clientes").select("company,id").eq("cuit", cuit).limit(20);
      if (error || !fichas?.length) return null;
      const found = [];
      for (const company of [...new Set(fichas.map((ficha) => ficha.company))]) {
        const ids = fichas.filter((ficha) => ficha.company === company).map((ficha) => ficha.id);
        const { data } = await supabase.from("contabilium_comprobantes").select(columns).eq("company", company).in("cliente_id", ids).order("fecha", { ascending: false }).limit(300);
        found.push(...(data || []));
      }
      return found.length ? { data: found } : null;
    };
    const timer = setTimeout(() => {
      byCuit().catch(() => null).then((result) => result || byName())
        .then(({ data, error }) => { if (active) setRows(error ? [] : data || []); }, () => {});
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [supabase, key, cuit]);
  return rows;
}

const dmy = (date) => String(date || "").slice(0, 10).split("-").reverse().join("/");

// Competidores de la familia y compras del cliente: sale de la base, sin IA ni costo.
function ExtraAnswer({ rivals, purchases }) {
  return (
    <>
      {rivals && (
        <section className="assistant-answer" aria-label="Competidores">
          <span className="assistant-group-label">Competencia{rivals.families.length ? ` · ${rivals.families.join(", ")}` : ""} · {rivals.list.length}</span>
          {rivals.list.length === 0 ? <p className="muted small">No hay competidores cargados de esa familia en Academia.</p> : (
            <ul className="assistant-rivals">{rivals.list.slice(0, 25).map((rival) => <li key={rival.id || rival.name}><strong>{rival.name}</strong>{rival.summary ? <span className="muted small"> · {String(rival.summary).slice(0, 140)}</span> : null}</li>)}</ul>
          )}
        </section>
      )}
      {purchases.length > 0 && (
        <section className="assistant-answer" aria-label="Compras del cliente">
          <span className="assistant-group-label">Compras (Contabilium)</span>
          {purchases.slice(0, 3).map((summary) => (
            <div key={summary.name} className="assistant-answer-team">
              <p><strong>{summary.name}</strong> <span className="muted small">({summary.companies.join(", ")})</span><br />{purchaseLine(summary)}</p>
              <ul className="assistant-rivals">{summary.recentRows.map((row) => <li key={`${row.company}-${row.numero}-${row.tipo}`} className="muted small">{dmy(row.fecha)} · {row.tipo} {row.numero} · $ {Math.round(Number(row.total) || 0).toLocaleString("es-AR")}</li>)}</ul>
            </div>
          ))}
          <span className="muted small">El historial de Contabilium todavía se está copiando: puede faltar lo más viejo.</span>
        </section>
      )}
    </>
  );
}

// Pregunta a la IA (lib/assistant-ai.mjs vía /api/admin-users). Sin clave o sin crédito devuelve
// { ok: false, reason } y la ventana sigue como buscador.
export async function askAi(supabase, payload) {
  const { data } = await supabase.auth.getSession();
  const response = await adminFetch({ action: "assistant", ...payload }, data?.session?.access_token || "").catch(() => null);
  if (!response) return { ok: false, reason: "red", error: "Sin conexión con el servidor. Revisá internet y probá de nuevo." };
  // 22/10: si el servidor no devuelve JSON (se cortó o tardó), se dice con el código para poder rastrearlo.
  return response.json().catch(() => ({ ok: false, reason: "red", error: `El servidor no respondió bien (código ${response.status}). Probá de nuevo.` }));
}

// Texto de la IA (22/10): **negrita** y viñetas "- " se ven como tales, no con los asteriscos.
const bold = (line) => line.split(/\*\*(.+?)\*\*/g).map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part));
// 22/10: listas numeradas, títulos "###" en negrita, la primera línea destacada y "Fuente:" aparte, en chico.
export function AiText({ text = "" }) {
  const blocks = [];
  for (const line of String(text).split(/\r?\n/)) {
    const item = line.match(/^\s*[-•*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (item || numbered) {
      const type = item ? "list" : "olist";
      if (blocks.at(-1)?.type !== type) blocks.push({ type, lines: [] });
      blocks.at(-1).lines.push((item || numbered)[1]);
    } else if (/^\s*fuente\s*:/i.test(line)) blocks.push({ type: "source", line: line.trim() });
    else if (/^\s*#+\s+/.test(line)) blocks.push({ type: "title", line: line.replace(/^\s*#+\s*/, "").replace(/\*\*/g, "") });
    else if (line.trim()) blocks.push({ type: "p", line });
  }
  const firstText = blocks.findIndex((block) => block.type === "p");
  return blocks.map((block, index) => {
    if (block.type === "list") return <ul key={index}>{block.lines.map((line, at) => <li key={at}>{bold(line)}</li>)}</ul>;
    if (block.type === "olist") return <ol key={index}>{block.lines.map((line, at) => <li key={at}>{bold(line)}</li>)}</ol>;
    if (block.type === "source") return <p key={index} className="assistant-source">{block.line}</p>;
    if (block.type === "title") return <p key={index} className="assistant-title">{block.line}</p>;
    return <p key={index} className={index === firstText ? "assistant-lead" : undefined}>{bold(block.line)}</p>;
  });
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* sin portapapeles */ }
  }
  return <button type="button" className="assistant-copy" onClick={copy}><Copy size={14} /> {copied ? "Copiado" : "Copiar"}</button>;
}

// 👍 / 👎: queda guardado para que Felipe revise lo que salió mal.
function Votes({ supabase, question, answer, source, onBad }) {
  const [voted, setVoted] = useState(0);
  async function vote(value) {
    setVoted(value);
    if (supabase?.from) await Promise.resolve(supabase.from("assistant_feedback").insert({ question, answer: String(answer || "").slice(0, 4000), source, vote: value })).catch(() => {});
    if (value < 0 && onBad) onBad();
  }
  if (voted) return <span className="muted small">{voted > 0 ? "¡Gracias!" : "Gracias, queda anotado para corregirlo."}</span>;
  return (
    <span className="assistant-votes">
      <span className="muted small">¿Te sirvió?</span>
      <button type="button" aria-label="Me sirvió" onClick={() => vote(1)}><ThumbsUp size={14} /></button>
      <button type="button" aria-label="No me sirvió" onClick={() => vote(-1)}><ThumbsDown size={14} /></button>
    </span>
  );
}

// Formulario para enseñarle (solo Felipe). Si viene con id, corrige lo ya enseñado.
export function TeachForm({ supabase, initial, onSaved, onCancel }) {
  const [form, setForm] = useState({ question: initial.question || "", product: initial.product || "", answer: initial.answer || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  async function save(event) {
    event.preventDefault();
    if (!form.question.trim() || !form.answer.trim()) { setError("Completá la pregunta y la respuesta."); return; }
    setBusy(true); setError("");
    const row = { question: form.question.trim(), product: form.product.trim(), answer: form.answer.trim(), updated_at: new Date().toISOString() };
    const request = initial.id
      ? supabase.from("assistant_knowledge").update(row).eq("id", initial.id).select("*")
      : supabase.from("assistant_knowledge").insert(row).select("*");
    const { data, error: saveError } = await request;
    setBusy(false);
    if (saveError || !data?.length) { setError("No se pudo guardar. Probá de nuevo."); return; }
    onSaved(data[0]);
  }
  async function remove() {
    setBusy(true);
    const { error: deleteError } = await supabase.from("assistant_knowledge").delete().eq("id", initial.id);
    setBusy(false);
    if (deleteError) { setError("No se pudo borrar."); return; }
    onSaved(null, initial.id);
  }
  return (
    <form className="assistant-teach" onSubmit={save} aria-label="Enseñarle al asistente">
      <strong><GraduationCap size={15} /> {initial.id ? "Corregir lo que le enseñaste" : "Enseñarle la respuesta correcta"}</strong>
      <label>Pregunta<input value={form.question} onChange={set("question")} placeholder="¿Cuánto rinde?" /></label>
      <label>Producto (opcional)<input value={form.product} onChange={set("product")} placeholder="Easy Spray" /></label>
      <label>Respuesta correcta<textarea rows={4} value={form.answer} onChange={set("answer")} placeholder="Cada envase rinde 2 m² en 2 cm de espesor." /></label>
      {error && <span className="muted small">{error}</span>}
      <div className="assistant-teach-actions">
        <button type="submit" className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancelar</button>
        {initial.id && <button type="button" className="link-button" disabled={busy} onClick={remove}>Borrar</button>}
      </div>
      <span className="muted small">Desde ahora va primero para todo el equipo, antes que Mercado Libre y las fichas.</span>
    </form>
  );
}

function Answer({ intent, facts, team, product, taught = [], isAdmin, onEdit }) {
  return (
    <section className="assistant-answer" aria-label="Respuesta">
      <span className="assistant-group-label">{intent?.label || "Respuesta"}{product ? ` · ${product}` : ""}</span>
      {taught.map((entry) => (
        <div key={entry.id} className="assistant-answer-team">
          <p>{entry.answer}</p>
          <div className="assistant-answer-meta">
            <span className="muted small">✓ Validada por Felipe{entry.product ? ` · ${entry.product}` : ""}</span>
            <span className="assistant-answer-tools">
              {isAdmin && <button type="button" className="link-button" onClick={() => onEdit(entry)}>Editar</button>}
              <CopyButton text={entry.answer} />
            </span>
          </div>
        </div>
      ))}
      {team?.varied && (
        <div className="assistant-answer-facts">
          <span className="muted small">En Mercado Libre respondimos distinto según el producto ({team.total} respuestas):</span>
          <ul>{team.examples.map((text) => <li key={text}>{text}</li>)}</ul>
        </div>
      )}
      {team && !team.varied && (
        <div className="assistant-answer-team">
          <p>{team.text}</p>
          <div className="assistant-answer-meta">
            <span className="muted small">Así lo respondemos en Mercado Libre · {team.uses} de {team.total} respuestas</span>
            <CopyButton text={team.text} />
          </div>
        </div>
      )}
      {facts.length > 0 && (
        <div className="assistant-answer-facts">
          <span className="muted small">Según la guía:</span>
          <ul>{facts.map((fact) => <li key={`${fact.guide}-${fact.text}`}>{fact.text} <span className="muted small">({fact.guide}{fact.validated ? "" : ", borrador"})</span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

export function AssistantWindow({ supabase, clients = [], workspace = {}, firstName = "", isAdmin = false, onClose, onAction = null, rapypClients = null }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const [showAll, setShowAll] = useState(false);
  const { result, guides, competitors } = useKnowledge(supabase, query, { clients });
  const labels = Object.fromEntries(KNOWLEDGE_TYPES);
  const groups = (result.order || KNOWLEDGE_TYPES.map(([key]) => key)).filter((key) => result.groups[key]?.length).map((key) => [key, labels[key]]);
  // Si lo que más coincide es una explicación del CRM o de Mercado Libre, va arriba como respuesta.
  const helpTop = result.groups.ayuda?.[0];
  // 22/10: el puntaje de una pantalla del CRM ronda 3-4 (título + texto); antes pedía 6 y nunca aparecía.
  const helpAnswer = helpTop && helpTop.score >= 3 && groups[0]?.[0] === "ayuda" ? helpTop : null;
  const typed = query.trim();
  const intent = typed ? detectIntent(typed) : null;
  const teamSearch = useTeamAnswer(supabase, typed, intent);
  const teamRows = teamSearch.rows;
  const facts = intent ? guideFacts(guides, typed, intent) : [];
  const team = intent ? teamAnswer(teamRows, intent) : null;
  const [taughtAll, setTaughtAll] = useState([]);
  const [teach, setTeach] = useState(null); // datos del formulario "Enseñarle" abierto
  useEffect(() => {
    if (!supabase?.from) return;
    Promise.resolve(supabase.from("assistant_knowledge").select("id,question,product,answer,updated_at")).then(({ data }) => setTaughtAll(data || []), () => {});
  }, [supabase]);
  const taught = typed ? matchTaught(taughtAll, typed) : [];
  const rivals = typed ? rivalsFor(competitors || [], typed) : null;
  // Reglas de la empresa (Felipe las edita como "regla") y aplicadores de la red RAPYP (solo quien ve ese mapa).
  const rules = taughtAll.filter(isRule);
  const rapyp = typed && rapypClients ? rapypFor(rapypClients, typed, { competitors: competitors || [] }) : null;
  // "Contame todo de lavopa": ficha de la cartera + sus compras en Contabilium (aunque no diga "compró").
  const clientsFound = typed && (asksClient(typed) || !intent) ? clientCards(clients, typed) : [];
  const buyWords = purchaseNameWords(typed);
  const purchaseRows = usePurchases(supabase, buyWords.length ? buyWords : clientsFound.length ? clientWords(typed) : [], !buyWords.length && clientsFound.length === 1 ? clientsFound[0].cuit : null);
  const purchases = purchaseRows.length ? purchaseSummary(purchaseRows) : [];
  const mine = typed ? workspaceAnswer(typed, workspace) : [];
  const listPrices = useListPrices(supabase, typed);
  // Números del negocio (22/10): la facturación se lee recién la primera vez que se pregunta por ellos.
  const wantsBusiness = Boolean(typed && asksBusiness(typed));
  const [businessOn, setBusinessOn] = useState(false);
  useEffect(() => { if (wantsBusiness) setBusinessOn(true); }, [wantsBusiness]);
  const billing = useComprobantes(businessOn ? supabase : null);
  const business = useMemo(() => (businessOn && billing.status === "ready" ? businessFacts(billing.rows, clients, argentinaToday()) : null), [businessOn, billing.status, billing.rows, clients]);
  const businessShown = wantsBusiness && business ? businessLines(business) : [];
  // Si se pregunta antes de que llegue la facturación, se espera y se pregunta solo (así no dice "no tengo el dato").
  const waitingBusiness = wantsBusiness && !business && billing.status !== "error" && Boolean(supabase?.from);
  // 22/10: lo que anotó el equipo sobre el tema, a quién derivar y qué aprendimos en la Cola del día.
  const notes = typed && !clientsFound.length ? teamNotes(typed, { interactions: workspace.interactions || [], clients, prospects: workspace.prospects || [] }) : [];
  const routes = typed ? routeFor(typed) : [];
  const learning = typed && asksLearning(typed) ? prospectLearning({ prospects: workspace.prospects || [], clients }) : null;
  const learningText = learning ? learningContext(learning) : "";
  const hasExtra = Boolean(rivals || purchases.length || mine.length || clientsFound.length || rapyp || notes.length || learningText || listPrices.entries.length || businessShown.length);
  const hasAnswer = Boolean(taught.length || (intent && (facts.length || team)) || helpAnswer);
  useEffect(() => { setShowAll(false); }, [typed]);
  const [chat, setChat] = useState([]);
  const [ai, setAi] = useState("unknown"); // unknown | on | off
  const [thinking, setThinking] = useState(false);
  const [aiError, setAiError] = useState("");
  // Una sugerencia tocada se le pregunta a la IA apenas el buscador junta lo que encontró.
  const [autoAsk, setAutoAsk] = useState("");
  const bodyRef = useRef(null);
  useEffect(() => { const body = bodyRef.current; if (body && typeof body.scrollTo === "function") body.scrollTo({ top: body.scrollHeight, behavior: "smooth" }); }, [chat, thinking]);

  const lastQuestion = [...chat].reverse().find((turn) => turn.role === "user")?.text || "";
  const teachFrom = (answer = "") => setTeach({ question: typed || lastQuestion, product: productWords(typed, intent).join(" "), answer });
  function taughtSaved(entry, removedId) {
    setTaughtAll((current) => (removedId ? current.filter((item) => item.id !== removedId) : [entry, ...current.filter((item) => item.id !== entry.id)]));
    setTeach(null);
  }

  // "Guardala" (22/10): Felipe la guarda validada; el resto se la manda para aprobar (panel de 👎, "pedido").
  async function handleAction(action) {
    if (action?.kind !== "guardar_respuesta") return onAction ? onAction(action) : { ok: false };
    const input = action.input || {};
    if (!supabase?.from) return { ok: false, error: "Sin conexión." };
    if (isAdmin) {
      const row = { question: String(input.pregunta).trim(), product: String(input.producto || "").trim(), answer: String(input.respuesta).trim(), updated_at: new Date().toISOString() };
      const { data, error } = await supabase.from("assistant_knowledge").insert(row).select("*");
      if (error || !data?.length) return { ok: false, error: "No se pudo guardar." };
      setTaughtAll((current) => [data[0], ...current]);
      return { ok: true };
    }
    const { error } = await supabase.from("assistant_feedback").insert({ question: String(input.pregunta), answer: String(input.respuesta).slice(0, 4000), source: "pedido-guardar", vote: -1 });
    return error ? { ok: false, error: "No se pudo mandar." } : { ok: true };
  }

  async function submit(event) {
    event.preventDefault();
    // 22/10: aunque antes haya fallado (clave o crédito), se vuelve a intentar: si ya se arregló, responde.
    if (!typed || thinking || !supabase?.auth) return;
    if (waitingBusiness) { setAutoAsk(typed); return; }
    setThinking(true); setAiError("");
    const asked = typed;
    const history = chat.map((turn) => ({ role: turn.role, text: turn.text }));
    // Lo validado de las preguntas anteriores de la charla sigue en el contexto ("si es otro espesor…").
    const withEarlier = (current) => {
      const earlier = chat.filter((turn) => turn.role === "user").slice(-3).flatMap((turn) => matchTaught(taughtAll, turn.text));
      const seen = new Set();
      return [...current, ...earlier].filter((entry) => !seen.has(entry.id) && seen.add(entry.id)).slice(0, 5);
    };
    setChat((current) => [...current, { role: "user", text: asked }]);
    setQuery("");
    // La agenda va siempre: así puede planificar el día o proponer un seguimiento.
    const agenda = mine.some((block) => block.key === "tareas") ? [] : workspaceAnswer("tareas pendientes", workspace);
    let mlNow = teamRows;
    if (teamSearch.q && !teamSearch.ready && supabase?.rpc) {
      const fetched = await Promise.resolve(supabase.rpc("search_ml_knowledge", { q: teamSearch.q, max_rows: 40 })).catch(() => null);
      mlNow = fetched?.data || [];
    }
    const teamNow = mlNow === teamRows ? team : intent ? teamAnswer(mlNow, intent) : null;
    const pricesNow = listPrices.key && !listPrices.ready ? await loadListPrices(supabase, listPrices.words, isoToday()).catch(() => []) : listPrices.entries;
    const context = [rulesContext({ rules, competitors: competitors || [], rapyp }), routesContext(), wantsBusiness ? businessContext(business) : "", pricesContext(pricesNow), teamNotesContext(notes), learningText, clientContext(clientsFound), workspaceContext([...mine, ...agenda]), extraContext({ rivals, purchases }), buildAiContext({ intent, facts, team: teamNow, result, mlRows: mlNow, taught: withEarlier(taught) })].filter(Boolean).join("\n");
    const reply = await askAi(supabase, { question: asked, context, history, today: isoToday(), userName: firstName }).catch(() => ({ ok: false, reason: "red" }));
    setThinking(false);
    if (reply.ok) {
      setAi("on");
      setChat((current) => [...current, { role: "assistant", text: reply.text, actions: reply.actions || [] }]);
      // Si no tenía el dato, queda anotada para enseñársela (Más → Datos → Asistente).
      if (answerHasGap(reply.text) && supabase?.from) Promise.resolve(supabase.from("assistant_feedback").insert({ question: asked, answer: String(reply.text).slice(0, 4000), source: "ia-sin-dato", vote: -1 })).catch(() => {});
      return;
    }
    // Sin IA: la pregunta vuelve al cuadro para ver lo que encontró el buscador.
    setChat((current) => current.slice(0, -1));
    setQuery(asked);
    if (reply.reason === "sin-clave" || reply.reason === "sin-credito" || reply.reason === "clave") { setAi("off"); setAiError(isAdmin && reply.error ? reply.error : "La IA no está disponible ahora; te muestro lo que hay cargado."); return; }
    setAiError(`${reply.error || "La IA no pudo responder ahora. Probá de nuevo."}${reply.detail ? ` Detalle: ${reply.detail}` : reply.reason && reply.reason !== "red" ? ` (${reply.reason})` : ""}`);
  }

  useEffect(() => {
    if (!autoAsk || autoAsk !== typed || waitingBusiness) return undefined;
    const timer = setTimeout(() => { setAutoAsk(""); submit({ preventDefault() {} }); }, 900);
    return () => clearTimeout(timer);
  });

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(timer); };
  }, [onClose]);

  return (
    <aside className="assistant-window" role="dialog" aria-label="Asistente">
      <header className="assistant-window-head">
        <span className="assistant-window-logo"><AssistantLogo size={34} /></span>
        <div>
          <strong>Asistente Poliplast</strong>
          <span>Te ayudo con clientes, tareas, productos y Mercado Libre</span>
        </div>
        <button type="button" className="assistant-close" aria-label="Cerrar el asistente" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="assistant-window-body" ref={bodyRef}>
        <div className="assistant-bubble">
          <strong>¡Hola{firstName ? `, ${firstName}` : ""}!</strong> {dayBrief(workspace.tasks)} Pedime lo que necesites: armar el plan del día, el resumen de un cliente, un mensaje para mandar, agendar un seguimiento o cualquier dato de producto.
        </div>
        {chat.map((turn, index) => (
          <div key={index} className={turn.role === "user" ? "assistant-msg-user" : "assistant-bubble assistant-msg-ai"}>
            {turn.role === "assistant" && <span className="assistant-avatar" aria-hidden="true"><AssistantLogo size={18} /></span>}
            {turn.role === "assistant" ? <div className="assistant-ai-text"><AiText text={turn.text} /></div> : <p>{turn.text}</p>}
            {(turn.actions || []).map((action) => <ActionCard key={action.id || action.kind} action={action} onAction={handleAction} />)}
            {turn.role === "assistant" && (
              <div className="assistant-answer-meta">
                <Votes supabase={supabase} question={chat[index - 1]?.text || ""} answer={turn.text} source="ia" onBad={isAdmin ? () => setTeach({ question: chat[index - 1]?.text || "", product: "", answer: turn.text }) : null} />
                <CopyButton text={turn.text} />
              </div>
            )}
          </div>
        ))}
        {thinking && <div className="assistant-bubble assistant-typing" role="status" aria-label="Pensando"><span /><span /><span /></div>}
        {aiError && <div className="assistant-bubble muted">{aiError}</div>}
        {!typed && !chat.length && (
          <div className="assistant-chips" aria-label="Sugerencias">
            {SUGGESTIONS.map((text) => <button key={text} type="button" onClick={() => { setQuery(text); setAutoAsk(text); }}>{text}</button>)}
          </div>
        )}
        {rapyp && (
          <section className="assistant-answer" aria-label="Aplicadores RAPYP">
            <span className="assistant-group-label">Aplicadores de la red RAPYP{rapyp.zone.length ? ` · ${rapyp.zone.join(" ")}` : ""} ({rapyp.total})</span>
            {rapyp.list.length ? <ul className="assistant-rivals">{rapyp.list.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="muted small">No hay aplicadores RAPYP cargados en esa zona: consultá con Juan o David.</p>}
            <span className="muted small">Ordenados del mejor cliente: más kilos comprados y compra más reciente. Los competidores quedan afuera.</span>
          </section>
        )}
        {clientsFound.map((card) => (
          <section key={card.id} className="assistant-answer" aria-label={`Ficha de ${card.name}`}>
            <span className="assistant-group-label">Cliente · {card.name}</span>
            <ul className="assistant-rivals">{card.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
        ))}
        {mine.map((block) => (
          <section key={block.key} className="assistant-answer" aria-label={block.label}>
            <span className="assistant-group-label">{block.label}</span>
            <ul className="assistant-rivals">{block.lines.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
        ))}
        {waitingBusiness && <p className="muted small" role="status">Leyendo la facturación de Contabilium…</p>}
        {businessShown.length > 0 && (
          <section className="assistant-answer" aria-label="Números del negocio">
            <span className="assistant-group-label">Números del negocio</span>
            <ul className="assistant-rivals">{businessShown.map((line) => <li key={line}>{line}</li>)}</ul>
            <span className="muted small">De la facturación de Contabilium (sin Mercado Libre). El detalle está en Prospección → Cola del día.</span>
          </section>
        )}
        {listPrices.entries.length > 0 && (
          <section className="assistant-answer" aria-label="Precios de lista">
            <span className="assistant-group-label">Precio de lista vigente</span>
            {listPrices.entries.slice(0, 4).map(({ variant, rows }) => (
              <div key={variant.id} className="assistant-price">
                <strong>{variant.name}{variant.sku ? <span className="muted small"> · {variant.sku}</span> : null}</strong>
                <ul className="assistant-rivals">{rows.map((row) => <li key={`${row.list}-${row.from}`}>{priceLine(row)}</li>)}</ul>
              </div>
            ))}
            <span className="muted small">Del catálogo del cotizador. Para un pedido, el cotizador puede aplicar reglas por cantidad, mayorista o forma de pago.</span>
          </section>
        )}
        {notes.length > 0 && (
          <section className="assistant-answer" aria-label="Lo que anotó el equipo">
            <span className="assistant-group-label">Lo que anotó el equipo</span>
            <ul className="assistant-rivals">{notes.map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
        )}
        {learningText && (
          <section className="assistant-answer" aria-label="Qué aprendimos">
            <span className="assistant-group-label">Qué aprendimos en la Cola del día</span>
            <ul className="assistant-rivals">{learningText.split("\n").slice(1).map((line) => <li key={line}>{line.replace(/^- /, "")}</li>)}</ul>
            <span className="muted small">{learningText.split("\n")[0]}</span>
          </section>
        )}
        {routes.length > 0 && <p className="muted small">Si hace falta una persona: {routes.map((route) => `${route.who} (${route.why})`).join(" · ")}.</p>}
        {hasExtra && <ExtraAnswer rivals={rivals} purchases={purchases} />}
        {typed && result.total === 0 && !hasAnswer && !hasExtra && (
          <div className="assistant-bubble muted">
            No encontré nada cargado con “{typed}”.
            {" "}<button type="button" className="link-button" onClick={() => submit({ preventDefault() {} })}>Preguntale a la IA</button> (sabe de todo; lo que no sea de Poliplast lo marca como dato general).
            {isAdmin && !teach && <> <button type="button" className="link-button" onClick={() => teachFrom("")}>Enseñarle esta respuesta</button></>}
          </div>
        )}
        {hasAnswer && (
          <>
            {(taught.length > 0 || (!helpAnswer && intent && (facts.length || team))) && <Answer intent={intent} facts={facts} team={team} taught={taught} isAdmin={isAdmin} onEdit={(entry) => setTeach(entry)} product={productWords(typed, intent).join(" ")} />}
            {helpAnswer && !taught.length && (
              <section className="assistant-answer" aria-label="Respuesta">
                <span className="assistant-group-label">{helpAnswer.title}</span>
                <div className="assistant-answer-team"><p>{helpAnswer.snippet}</p><div className="assistant-answer-meta"><span className="muted small">Dónde: {helpAnswer.subtitle}</span><CopyButton text={helpAnswer.snippet} /></div></div>
              </section>
            )}
            <div className="assistant-answer-meta">
              <Votes key={typed} supabase={supabase} question={typed} answer={taught[0]?.answer || team?.text || facts.map((fact) => fact.text).join(" · ") || helpAnswer?.snippet || ""} source={taught.length ? "validada" : "buscador"} onBad={isAdmin ? () => teachFrom(team && !team.varied ? team.text : "") : null} />
              {isAdmin && !teach && <button type="button" className="link-button" onClick={() => teachFrom(taught[0]?.answer || (team && !team.varied ? team.text : ""))}><GraduationCap size={14} /> Enseñarle</button>}
            </div>
          </>
        )}
        {teach && <TeachForm key={teach.id || teach.question} supabase={supabase} initial={teach} onSaved={taughtSaved} onCancel={() => setTeach(null)} />}
        {(hasAnswer || clientsFound.length > 0) && result.total > 0 && (
          <button type="button" className="assistant-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            <ChevronDown size={15} /> {showAll ? "Ocultar lo demás" : `Ver todo lo que encontré (${result.total})`}
          </button>
        )}
        {((!hasAnswer && !clientsFound.length) || showAll) && groups.map(([key, label]) => (
          <section key={key} className="assistant-group">
            <span className="assistant-group-label">{label}</span>
            {result.groups[key].slice(0, PER_GROUP).map((item) => (
              <article key={`${key}-${item.id}`} className="assistant-card">
                <strong>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</strong>
                {item.subtitle && <span className="muted small">{item.subtitle}</span>}
                {item.snippet && <q>{item.snippet}</q>}
              </article>
            ))}
          </section>
        ))}
        {typed && !hasAnswer && (hasExtra || result.total > 0) && (
          <div className="assistant-answer-meta">
            <Votes key={`v-${typed}`} supabase={supabase} question={typed} answer={[...mine.flatMap((block) => block.lines), ...groups.flatMap(([key]) => result.groups[key].slice(0, 2).map((item) => item.title))].join(" · ").slice(0, 2000)} source="buscador" onBad={isAdmin ? () => teachFrom("") : null} />
            {isAdmin && !teach && <button type="button" className="link-button" onClick={() => teachFrom("")}><GraduationCap size={14} /> Enseñarle</button>}
          </div>
        )}
      </div>

      <footer className="assistant-window-foot">
        <form className="assistant-input" onSubmit={submit}>
          <Search size={17} />
          <input ref={inputRef} aria-label="Preguntale al asistente" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={chat.length ? "Seguí la charla…" : "Ej.: contame todo de un cliente, o recordame llamarlo el lunes"} />
          <button type="submit" className="assistant-send" aria-label="Preguntar" disabled={!typed || thinking}><Send size={16} /></button>
        </form>
        <small className="muted">{ai === "off" ? "La IA no respondió la última vez; apretá Enter para reintentar. Mientras, te muestro lo que hay cargado." : ai === "on" ? "Responde con lo cargado y con lo que más respondimos en Mercado Libre. Revisá antes de pasarle un dato a un cliente." : "Escribí y apretá Enter para preguntar. Responde con lo cargado y con lo que ya respondimos en Mercado Libre."}</small>
      </footer>
    </aside>
  );
}

import { memo, useEffect, useState } from "react";
import { CircleAlert, GraduationCap, Search, Sparkles } from "lucide-react";
import {
  QUICK_REPLIES,
  REPLY_TEMPLATES,
  ROLE_PLAYS,
  RUBRIC,
  scoreBand,
} from "./knowledge";
import {
  COMMERCIAL_STAGES,
  ECERA,
  KNOWLEDGE_META,
  PLAYBOOKS,
  findObjections,
} from "./commercial-knowledge.mjs";
import { TeamSelf } from "./TeamSelf.jsx";
import { isChannelAdmin } from "./user-channels.mjs";
import { KNOWLEDGE_TYPES, buildKnowledgePrompt, searchKnowledge } from "./knowledge-search.mjs";
import { PRODUCT_CATALOG } from "./product-catalog.mjs";
import { OBJECTIONS } from "./commercial-knowledge.mjs";
import { Competencia } from "./Competencia.jsx";
import { PROSPECT_FAMILIES } from "./prospect-model.mjs";
import { ProductQuestion } from "./ProductQuestion.jsx";
import { ProductGuides } from "./ProductGuides.jsx";
import { buildBattlecard } from "./competitor-battlecard.mjs";
import { Empty, Goal } from "./ui-primitives";

export function QuickReplies({ myChannels }) {
  const replyChannels = myChannels.filter((key) => QUICK_REPLIES[key]);
  const [channel, setChannel] = useState(replyChannels[0] || "general");
  const [copied, setCopied] = useState("");
  async function copyReply(title, guidance) {
    try {
      await navigator.clipboard.writeText(guidance);
      setCopied(title);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("error");
    }
  }
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Sugerencias editables</span>
            <h2>Biblioteca de respuestas rápidas</h2>
          </div>
          {replyChannels.length > 1 && (
            <div className="segmented">
              {replyChannels.map((key) => (
                <button
                  key={key}
                  className={channel === key ? "selected" : ""}
                  onClick={() => setChannel(key)}
                >
                  {key === "general" ? "General" : key === "penosil" ? "Penosil" : key}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="reply-grid">
          {(QUICK_REPLIES[channel] || []).map(([title, guidance], index) => (
            <article className="reply-card" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{guidance}</p>
              {REPLY_TEMPLATES[channel]?.[title] && (
                <blockquote className="reply-template">{REPLY_TEMPLATES[channel][title]}</blockquote>
              )}
              <div className="panel-head-actions">
                {REPLY_TEMPLATES[channel]?.[title] && (
                  <button className="primary" onClick={() => copyReply(`${title}:mensaje`, REPLY_TEMPLATES[channel][title])}>
                    {copied === `${title}:mensaje` ? "Copiado ✓" : "Copiar mensaje"}
                  </button>
                )}
                <button onClick={() => copyReply(title, guidance)}>
                  {copied === title ? "Copiado ✓" : "Copiar criterio"}
                </button>
              </div>
            </article>
          ))}
        </div>
        {copied === "error" && (
          <div className="system-message">
            No se pudo copiar automáticamente. Seleccioná el texto manualmente.
          </div>
        )}
        <div className="quality-note">
          <CircleAlert size={19} />
          <p>
            Estas entradas orientan la conversación. Nunca envían mensajes
            automáticamente. Todo dato técnico, precio, stock, descuento o plazo
            debe validarse.
          </p>
        </div>
      </section>
      <Training />
    </div>
  );
}

// myChannels ya llega memoizado desde App.jsx (useMemo por email) e
// interactions/data/setData son referencias estables mientras nadie edita
// nada de esto - sin memo, cualquier estado ajeno de App.jsx (tipear en el
// buscador de otra pantalla, el tick de syncStatus) volvía a renderizar
// toda la Academia sin ningún prop distinto.
export function CompetitorTalk({ supabase }) {
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!supabase) { setRows([]); return; }
    supabase.from("competitors").select("id,name,kind,families,summary,caveats").order("name").then(({ data, error }) => {
      setRows(error ? [] : (data || []).filter((item) => item.kind !== "cliente"));
    });
  }, [supabase]);
  const current = (rows || []).find((item) => item.id === selected);
  const card = current ? buildBattlecard(current) : null;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Competencia</span>
          <h2>Qué hacer si el cliente nombra a un competidor</h2>
          <p>Elegí la empresa que mencionó. La guía usa solo lo verificado en su ficha y los principios de Academia.</p>
        </div>
      </div>
      {rows === null && <p className="muted">Cargando…</p>}
      {rows && rows.length === 0 && <p className="muted">{supabase ? "Todavía no hay competidores cargados." : "Esta guía está disponible en la versión en línea."}</p>}
      {rows && rows.length > 0 && (
        <label>El cliente nombró a…
          <select aria-label="Competidor nombrado" value={selected} onChange={(event) => setSelected(event.target.value)}>
            <option value="">Elegí un competidor</option>
            {rows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      )}
      {card && (
        <div className="battlecard">
          <article><h3>Qué sabemos</h3><p>{card.known || "Sin resumen cargado."}</p></article>
          {card.overlap.length > 0 && <article><h3>Dónde nos cruzamos</h3><ul>{card.overlap.map((line) => <li key={line}>{line}</li>)}</ul></article>}
          <article><h3>Preguntas para abrir la conversación</h3><ul>{card.ask.map((line) => <li key={line}>{line}</li>)}</ul></article>
          <article><h3>Cómo decirlo</h3><blockquote className="reply-template">{card.open}</blockquote></article>
          <article><h3>Qué no sabemos (averiguá)</h3><ul>{card.unknown.map((line) => <li key={line}>{line}</li>)}</ul></article>
          <article><h3>Evitá</h3><ul>{card.avoid.map((line) => <li key={line}>{line}</li>)}</ul></article>
        </div>
      )}
    </section>
  );
}

function AcademyBase({ myChannels, interactions, data, setData, supabase, userEmail }) {
  // 6 pestañas: Preguntar, Productos (guías por producto armadas con las fichas, 19/10), Cómo vender (método,
  // objeciones y perfiles), Competencia (cómo hablar de cada uno + la lista), Equipo y Práctica.
  const [section, setSection] = useState("search");
  const [sellTopic, setSellTopic] = useState("method");
  const admin = isChannelAdmin(userEmail);
  const felipeNotes = useFelipeNotes(supabase, admin);
  return (
    <div className="content-stack">
      <section className="panel academy-hero">
        <div>
          <span className="eyebrow">Sistema Comercial Grupo Poliplast</span>
          <h2>Academia comercial</h2>
          <p>Prepará conversaciones, practicá situaciones reales y convertí cada resultado en aprendizaje para el equipo.</p>
        </div>
        <div className="segmented">
          <button className={section === "search" ? "selected" : ""} onClick={() => setSection("search")}>Preguntar</button>
          <button className={section === "products" ? "selected" : ""} onClick={() => setSection("products")}>Productos</button>
          <button className={section === "sell" ? "selected" : ""} onClick={() => setSection("sell")}>Cómo vender</button>
          <button className={section === "competition" ? "selected" : ""} onClick={() => setSection("competition")}>Competencia</button>
          <button className={section === "team" ? "selected" : ""} onClick={() => setSection("team")}>Equipo</button>
          <button className={section === "practice" ? "selected" : ""} onClick={() => setSection("practice")}>Práctica</button>
        </div>
      </section>
      {section === "sell" && (
        <>
          <div className="segmented academy-subtabs" role="tablist" aria-label="Cómo vender">
            {[["method", "Método"], ["objections", "Objeciones"], ["profiles", "Perfiles de cliente"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={sellTopic === key} className={sellTopic === key ? "selected" : ""} onClick={() => setSellTopic(key)}>{label}</button>
            ))}
          </div>
          <CommercialKnowledge section={sellTopic} />
        </>
      )}
      {section === "competition" && (
        <>
          <CompetitorTalk supabase={supabase} />
          <Competencia supabase={supabase} userEmail={userEmail} families={PROSPECT_FAMILIES.map((item) => item.key)} />
        </>
      )}
      {section === "team" && (
        <>
          <TeamSelf supabase={supabase} userEmail={userEmail} isAdmin={admin} />
          {admin && <SellerProfiles profiles={felipeNotes} />}
        </>
      )}
      {section === "products" && <ProductGuides supabase={supabase} isAdmin={admin} userEmail={userEmail} />}
      {section === "search" && <ProductQuestion supabase={supabase} />}
      {section === "search" && <KnowledgeSearch supabase={supabase} clients={data.clients || []} sellers={felipeNotes} />}
      {section === "practice" && (
        <>
          <QuickReplies myChannels={myChannels} />
          <Coach interactions={interactions} data={data} setData={setData} />
        </>
      )}
    </div>
  );
}

export function KnowledgeSearch({ supabase, clients = [], sellers = [] }) {
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [guides, setGuides] = useState([]);
  const [copied, setCopied] = useState(false);
  const [pendingDocs, setPendingDocs] = useState(0);
  const [textsLoaded, setTextsLoaded] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase.from("technical_documents").select("id,title,family,product,sku,doc_type,status,notes").eq("status", "vigente").limit(500)
      .then(({ data }) => setDocs(data || []));
    supabase.from("technical_documents").select("id", { count: "exact", head: true }).neq("status", "vigente")
      .then(({ count }) => setPendingDocs(count || 0), () => {});
    supabase.from("competitors").select("id,name,kind,families,summary,caveats").then(({ data }) => setCompetitors(data || []));
    supabase.from("product_guides").select("id,family,product,summary,sections,status").then(({ data }) => setGuides(data || []), () => {});
  }, [supabase]);
  // El texto completo de las fichas pesa: se trae una sola vez, recién cuando alguien busca (17/10).
  const searching = query.trim().length > 2;
  useEffect(() => {
    if (!supabase || !searching || textsLoaded) return;
    setTextsLoaded(true);
    supabase.from("technical_documents").select("id,extracted_text").eq("status", "vigente").limit(500)
      .then(({ data }) => {
        const byId = new Map((data || []).map((row) => [row.id, row.extracted_text || ""]));
        setDocs((current) => current.map((doc) => ({ ...doc, extractedText: byId.get(doc.id) || "" })));
      }, () => {});
  }, [supabase, searching, textsLoaded]);
  const sources = { products: PRODUCT_CATALOG, guides, docs, clients, sellers, objections: OBJECTIONS, competitors };
  const result = searchKnowledge(query, sources);
  async function copy() {
    try { await navigator.clipboard.writeText(buildKnowledgePrompt(query, result)); setCopied(true); } catch { setCopied(false); }
  }
  return (
    <section className="panel commercial-knowledge">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Todo lo que sabe el CRM</span>
          <h2>Buscar en productos, fichas, clientes, equipo y competencia</h2>
        </div>
        <label className="search"><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setCopied(false); }} placeholder="Ej.: adhesivo para espuma, impermeabilizante, Satch…" /></label>
      </div>
      {!query.trim() && <Empty text="Escribí una palabra de un producto, un uso, un cliente o un competidor." />}
      {query.trim() && result.total === 0 && <Empty text="No encontramos nada con eso. Probá con otra palabra." />}
      {result.total > 0 && (
        <>
          <div className="knowledge-grid profiles">
            {KNOWLEDGE_TYPES.filter(([key]) => result.groups[key].length).map(([key, label]) => (
              <article key={key}>
                <span>{label}</span>
                <ul>{result.groups[key].map((item) => <li key={`${key}-${item.id}`}><strong>{item.title}</strong>{item.subtitle ? <span className="muted small"> · {item.subtitle}</span> : null}{item.snippet ? <q className="knowledge-snippet">{item.snippet}</q> : null}</li>)}</ul>
              </article>
            ))}
          </div>
          <div className="panel-head-actions">
            <button type="button" className="secondary" onClick={copy}>{copied ? "Copiado" : "Copiar consulta para tu IA"}</button>
          </div>
        </>
      )}
      <div className="quality-note"><CircleAlert size={19} /><p>Busca por palabras en lo que ya está cargado, también dentro del texto de las fichas técnicas vigentes (con el pedacito donde aparece).{pendingDocs > 0 ? ` ${pendingDocs} fichas todavía sin validar no entran: se validan en Base técnica.` : ""} Lo que no figura acá, no lo sabe el CRM.</p></div>
    </section>
  );
}

// Notas de Felipe sobre cada vendedor: viven en la base (tabla team_felipe_notes, solo la lee Felipe), no en el código de la app.
export function useFelipeNotes(supabase, enabled) {
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    if (!supabase || !enabled) { setNotes([]); return; }
    supabase.from("team_felipe_notes").select("id,data").order("id").then(({ data }) => setNotes((data || []).map((row) => row.data)));
  }, [supabase, enabled]);
  return notes;
}

export function SellerProfiles({ profiles = [] }) {
  if (!profiles.length) return null;
  return (
    <section className="panel commercial-knowledge">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Notas de Felipe · solo las ves vos</span>
          <h2>Cómo trabaja cada vendedor (borrador tuyo)</h2>
        </div>
      </div>
      <div className="knowledge-grid profiles">
        {profiles.map((item) => (
          <article key={item.id}>
            <span>{item.role}</span>
            <h3>{item.name}</h3>
            <p><strong>Área:</strong> {item.area}</p>
            <p><strong>Le llega:</strong> {item.receives}</p>
            <p><strong>Riesgo:</strong> {item.risk}</p>
            <p><strong>Asistencia del CRM:</strong></p>
            <ul>{(item.assist || []).map((line) => <li key={line}>{line}</li>)}</ul>
            <small><strong>Hábito sugerido:</strong> {item.habit}</small>
          </article>
        ))}
      </div>
      <div className="quality-note"><CircleAlert size={19} /><p>Son tus notas. Cada persona se describe a sí misma arriba; con eso vamos ajustando.</p></div>
    </section>
  );
}

export const Academy = memo(AcademyBase);

export function CommercialKnowledge({ section }) {
  const [search, setSearch] = useState("");
  const objections = findObjections(search);
  return (
    <section className="panel commercial-knowledge">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Contenido {KNOWLEDGE_META.status} · {KNOWLEDGE_META.version}</span>
          <h2>{section === "method" ? "Proceso y método E-C-E-R-A" : section === "objections" ? "Biblioteca única de objeciones" : "Perfiles y playbooks"}</h2>
        </div>
        {section === "objections" && <label className="search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar objeción o respuesta…" /></label>}
      </div>
      {section === "method" && (
        <>
          <div className="ecera-strip">{ECERA.map((step, index) => <article key={step.id}><span>{index + 1}</span><strong>{step.label}</strong><p>{step.guidance}</p></article>)}</div>
          <div className="knowledge-grid stages">{COMMERCIAL_STAGES.map((stage, index) => <article key={stage.id}><span>Etapa {index + 1}</span><h3>{stage.label}</h3><p>{stage.objective}</p><small>Avanza cuando: {stage.advanceWhen}</small></article>)}</div>
        </>
      )}
      {section === "objections" && <div className="knowledge-grid objections">{objections.map((item) => <article key={item.id}><span>Objeción</span><h3>{item.label}</h3><p><strong>Puede significar:</strong> {item.meaning}</p><p><strong>Explorar:</strong> {item.explore}</p><small><strong>Respuesta a construir:</strong> {item.response}</small></article>)}{!objections.length && <Empty text="No encontramos una objeción con ese criterio." />}</div>}
      {section === "profiles" && <div className="knowledge-grid profiles">{PLAYBOOKS.map((item) => <article key={item.id}><span>{item.families.join(" · ")}</span><h3>{item.label}</h3><p><strong>Busca:</strong> {item.motivation}</p><p><strong>Objeción típica:</strong> {item.typicalObjection}</p><small><strong>Próximo paso:</strong> {item.nextStep}</small></article>)}</div>}
      <div className="quality-note"><CircleAlert size={19} /><p>Fuente: Sistema Comercial Grupo Poliplast. Los criterios orientan; precio, stock, condiciones y datos técnicos deben verificarse antes de responder.</p></div>
    </section>
  );
}

export function Coach({ interactions, data, setData }) {
  const [selected, setSelected] = useState(interactions[0]?.id || "");
  const interaction = interactions.find((item) => item.id === selected);
  const interactionClient = interaction && data.clients.find((client) => client.id === interaction.clientId);
  const [scores, setScores] = useState(
    Object.fromEntries(RUBRIC.map(([id]) => [id, 0])),
  );
  const [feedback, setFeedback] = useState({
    good: "",
    missing: "",
    risk: "",
    suggested: "",
    learning: "",
  });
  const total = Object.values(scores).reduce(
    (sum, value) => sum + Number(value),
    0,
  );
  const band = scoreBand(total);

  useEffect(() => {
    if (interaction?.evaluation) {
      setScores(interaction.evaluation.scores);
      setFeedback(interaction.evaluation.feedback);
      return;
    }
    setScores(Object.fromEntries(RUBRIC.map(([id]) => [id, 0])));
    setFeedback({
      good: "",
      missing: "",
      risk: "",
      suggested: "",
      learning: "",
    });
  }, [selected]);

  function saveEvaluation() {
    if (!interaction) return;
    const evaluation = {
      scores,
      total,
      band: band.label,
      feedback,
      evaluatedAt: new Date().toISOString(),
    };
    setData({
      ...data,
      interactions: data.interactions.map((item) =>
        item.id === interaction.id ? { ...item, evaluation } : item,
      ),
    });
  }

  if (!interactions.length)
    return (
      <section className="panel">
        <Empty text="Registrá una conversación para poder evaluarla." />
      </section>
    );
  return (
    <div className="coach-layout">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Conversación</span>
            <h2>Entrenador comercial</h2>
          </div>
          <Sparkles size={22} />
        </div>
        <label className="coach-select">
          Elegir conversación
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {interactions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.company} ·{" "}
                {new Date(item.createdAt).toLocaleDateString("es-AR")}
              </option>
            ))}
          </select>
        </label>
        {interaction && (
          <div className="conversation-brief">
            <strong>{interaction.company}</strong>
            <span>
              {interaction.contact || "Contacto sin identificar"} ·{" "}
              {interactionClient?.family || interaction.family}
            </span>
            <p>{interaction.summary || interaction.need || "Sin resumen"}</p>
          </div>
        )}
        <div className="score-summary">
          <div>
            <strong>
              {total}
              <small>/28</small>
            </strong>
            <span className={band.tone}>{band.label}</span>
          </div>
          <p>0–14 reforzar · 15–21 aceptable · 22–28 modelo</p>
        </div>
      </section>
      <section className="panel rubric-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Rúbrica Claude</span>
            <h2>14 criterios</h2>
          </div>
        </div>
        <div className="rubric-list">
          {RUBRIC.map(([id, label, question]) => (
            <div className="rubric-row" key={id}>
              <div>
                <strong>{label}</strong>
                <span>{question}</span>
              </div>
              <div className="score-buttons">
                {[0, 1, 2].map((value) => (
                  <button
                    className={scores[id] === value ? "selected" : ""}
                    onClick={() => setScores({ ...scores, [id]: value })}
                    key={value}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel feedback-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Devolución</span>
            <h2>Aprendizaje de la conversación</h2>
          </div>
        </div>
        <div className="feedback-grid">
          {[
            ["good", "Qué se hizo bien"],
            ["missing", "Qué faltó preguntar"],
            ["risk", "Riesgo detectado"],
            ["suggested", "Próximo mensaje sugerido"],
            ["learning", "Aprendizaje reutilizable"],
          ].map(([id, label]) => (
            <label key={id}>
              {label}
              <textarea
                value={feedback[id]}
                onChange={(e) =>
                  setFeedback({ ...feedback, [id]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
        <button className="primary" onClick={saveEvaluation}>
          Guardar evaluación
        </button>
      </section>
    </div>
  );
}

export function Training() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Formación</span>
          <h2>Role-play semanal</h2>
        </div>
        <GraduationCap size={22} />
      </div>
      <div className="role-grid">
        {ROLE_PLAYS.map(([title, goal], index) => (
          <article key={title}>
            <span>Ejercicio {index + 1}</span>
            <strong>{title}</strong>
            <p>{goal}</p>
          </article>
        ))}
      </div>
      <div className="cadence-grid">
        <Goal title="Diaria · 5 min" text="Revisar puntajes bajos y riesgos." />
        <Goal
          title="Semanal · 30 min"
          text="Un role-play y 2–3 conversaciones."
        />
        <Goal title="Mensual · 60 min" text="Tendencias, recompra y ajustes." />
      </div>
    </section>
  );
}

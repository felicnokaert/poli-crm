import { memo, useEffect, useState } from "react";
import { CircleAlert, GraduationCap, Search, Sparkles } from "lucide-react";
import {
  QUICK_REPLIES,
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
import PriceMemory from "./PriceMemory";
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
              <button onClick={() => copyReply(title, guidance)}>
                {copied === title ? "Copiado ✓" : "Copiar criterio"}
              </button>
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
function AcademyBase({ myChannels, interactions, data, setData }) {
  const [section, setSection] = useState("method");
  return (
    <div className="content-stack">
      <section className="panel academy-hero">
        <div>
          <span className="eyebrow">Sistema Comercial Grupo Poliplast</span>
          <h2>Academia comercial</h2>
          <p>Prepará conversaciones, practicá situaciones reales y convertí cada resultado en aprendizaje para el equipo.</p>
        </div>
        <div className="segmented">
          <button className={section === "method" ? "selected" : ""} onClick={() => setSection("method")}>Método</button>
          <button className={section === "objections" ? "selected" : ""} onClick={() => setSection("objections")}>Objeciones</button>
          <button className={section === "profiles" ? "selected" : ""} onClick={() => setSection("profiles")}>Perfiles</button>
          <button className={section === "library" ? "selected" : ""} onClick={() => setSection("library")}>Biblioteca y práctica</button>
          <button className={section === "coach" ? "selected" : ""} onClick={() => setSection("coach")}>Evaluar conversaciones</button>
        </div>
      </section>
      {["method", "objections", "profiles"].includes(section) && <CommercialKnowledge section={section} />}
      {section === "library" && <QuickReplies myChannels={myChannels} />}
      {section === "coach" && (
        <>
          <PriceMemory sales={data.sales || []} />
          <Coach interactions={interactions} data={data} setData={setData} />
        </>
      )}
    </div>
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

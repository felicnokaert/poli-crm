import { useRef, useState } from "react";
import { Copy, FileText, MessageCircleQuestionMark } from "lucide-react";
import { answerQuestion, questionPrompt } from "./product-answer.mjs";

// "Preguntale a tus productos": responde con las líneas literales de las fichas técnicas cargadas en
// Base técnica (PDF, Word, Excel o .md de MarkItDown). Sin IA paga: si hace falta algo más elaborado,
// arma la consulta con el texto de las fichas para pegar en el Claude o ChatGPT de cada uno.
export function ProductQuestion({ supabase }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const docsRef = useRef(null);

  async function ask(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy(true); setError(""); setCopied(false);
    try {
      if (!docsRef.current) {
        // Se baja una sola vez por sesión, recién cuando alguien pregunta (el texto de las fichas pesa).
        const rows = [];
        for (let from = 0; ; from += 500) {
          const { data, error: loadError } = await supabase.from("technical_documents").select("id,title,family,product,sku,status,source_file,extracted_text").not("extracted_text", "is", null).range(from, from + 499);
          if (loadError) throw loadError;
          rows.push(...(data || []));
          if (!data || data.length < 500) break;
        }
        docsRef.current = rows;
      }
      setAnswer(answerQuestion(question, docsRef.current));
    } catch {
      setError("No pude leer las fichas técnicas. Probá de nuevo en un momento.");
    }
    setBusy(false);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(questionPrompt(question, answer?.results || []));
      setCopied(true);
    } catch { setCopied(false); }
  }

  if (!supabase) return null;
  return (
    <section className="panel product-question">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Responde con tus fichas técnicas</span>
          <h2><MessageCircleQuestionMark size={18} /> Preguntale a tus productos</h2>
          <p>Ej.: «¿con qué temperatura se trabaja el 618 SP?» o «¿cuánto rinde Penosil Easy Spray?». Busca en las fichas de Base técnica y te muestra lo que dicen, con la fuente. Si no está escrito, no lo inventa.</p>
        </div>
      </div>
      <form className="product-question-form" onSubmit={ask}>
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Escribí tu pregunta sobre un producto…" aria-label="Pregunta sobre un producto" />
        <button type="submit" className="primary" disabled={busy || !question.trim()}>{busy ? "Buscando…" : "Preguntar"}</button>
      </form>
      {error && <div className="system-message error">{error}</div>}
      {answer && (
        <div className="product-question-answer">
          {!answer.results.length && <p className="muted">No encontré una ficha de ese producto. Probá con el código o el nombre como figura en la ficha (ej. «618», «Easy Spray»), o subila en Base técnica.</p>}
          {answer.results.length > 0 && !answer.topics.length && <p className="muted">Encontré estas fichas. Decime qué dato buscás (temperatura, rendimiento, densidad, tiempos, mezcla, almacenamiento…) y te muestro la línea exacta.</p>}
          {answer.results.length > 0 && answer.topics.length > 0 && !answer.answered && <p className="muted">Las fichas de ese producto no mencionan {answer.topicLabels.join(" ni ").toLowerCase()}. No lo invento: podés consultarlo con la IA abajo o con el proveedor.</p>}
          {answer.results.map(({ doc, lines }) => (
            <article key={doc.id}>
              <h3><FileText size={15} /> {doc.title} {doc.status !== "vigente" && <span className="pill warn">sin validar</span>}</h3>
              {lines.length > 0 ? <ul>{lines.map((line) => <li key={line}>{line}</li>)}</ul> : answer.topics.length > 0 && <p className="muted small">Esta ficha no lo dice.</p>}
            </article>
          ))}
          {answer.results.length > 0 && (
            <button type="button" className="secondary" onClick={copyPrompt}><Copy size={14} /> {copied ? "Copiado: pegalo en Claude o ChatGPT" : "Copiar para preguntarle a tu IA"}</button>
          )}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";

// Derivaciones del asistente de WhatsApp (3/11): «te paso con Juan». Las anota el servidor (crm_system_status wa-derivations);
// cada persona ve las suyas (los administradores ven todas), crea la tarea en su propio espacio y las marca como resueltas.
// Lo resuelto se guarda en el espacio de trabajo (data.derivationsDone), no en el servidor.
import { derivationsFor } from "./derivations.mjs";

export function WhatsAppDerivations({ supabase, firstName, isAdmin, done, onTask, onDone }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!supabase?.from) return undefined;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from("crm_system_status").select("detail").eq("key", "wa-derivations").maybeSingle();
        if (alive) setItems(Array.isArray(data?.detail?.items) ? data.detail.items : []);
      } catch { /* sin derivaciones */ }
    })();
    return () => { alive = false; };
  }, [supabase]);
  const open = derivationsFor(items, { firstName, isAdmin, done });
  if (!open.length) return null;
  return (
    <section className="panel" aria-label="Derivaciones del asistente">
      <h3>El asistente derivó {open.length} {open.length === 1 ? "conversación" : "conversaciones"}</h3>
      <ul>
        {open.map((item) => (
          <li key={item.id}>
            <strong>{item.name || `…${String(item.wa).slice(-4)}`}</strong> · para {item.to} · {String(item.at).slice(0, 10)}{" "}
            <button type="button" className="secondary" onClick={() => { onTask(item); onDone(item.id); }}>Crear tarea</button>{" "}
            <button type="button" className="link-button" onClick={() => onDone(item.id)}>Ya está resuelta</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

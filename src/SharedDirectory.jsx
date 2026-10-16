import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { mergeDirectory, publishableClients, toDirectoryRecord } from "./shared-directory.mjs";

const CHUNK = 200;

export function SharedDirectory({ supabase, session, clients, setClients }) {
  const email = session?.user?.email || "";
  const [available, setAvailable] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadCount() {
    if (!supabase) return;
    const { count, error } = await supabase.from("shared_companies").select("id", { count: "exact", head: true });
    setAvailable(error ? null : count || 0);
  }
  useEffect(() => { loadCount(); }, [supabase]);

  async function publish() {
    setBusy(true);
    try {
      const rows = publishableClients(clients).map((client) => ({ id: client.id, data: toDirectoryRecord(client), updated_by_email: email, updated_at: new Date().toISOString() }));
      for (let index = 0; index < rows.length; index += CHUNK) {
        const { error } = await supabase.from("shared_companies").upsert(rows.slice(index, index + CHUNK));
        if (error) throw error;
      }
      setMessage(`Publicaste ${rows.length} empresas para el equipo (nombre, rubro, ubicación, contactos y tu clasificación).`);
      await loadCount();
    } catch {
      setMessage("No se pudo publicar. Probá de nuevo en un momento.");
    }
    setBusy(false);
  }

  async function bring() {
    setBusy(true);
    try {
      const records = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("shared_companies").select("data").range(from, from + 999);
        if (error) throw error;
        records.push(...(data || []).map((row) => row.data));
        if (!data || data.length < 1000) break;
      }
      const result = mergeDirectory(clients, records);
      if (result.added || result.updated) setClients(result.clients);
      const parts = [];
      if (result.added) parts.push(`Se sumaron ${result.added} empresas del equipo a tu lista.`);
      if (result.updated) parts.push(`${result.updated} ya las tenías y se les sumó la clasificación (cliente, prospecto, aplicador…).`);
      setMessage(parts.length ? parts.join(" ") : "Ya tenés todas las empresas del equipo, con su clasificación.");
    } catch {
      setMessage("No se pudieron traer las empresas del equipo.");
    }
    setBusy(false);
  }

  if (!supabase) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Beta · compartido</span>
          <h2><Users size={18} /> Directorio de empresas del equipo</h2>
          <p>Las empresas, el mapa y los contactos sirven para todos: cualquiera puede sumar las suyas, y solo Felipe puede borrar del directorio. Viaja también la clasificación de cada empresa (cliente, prospecto, no corresponde, aplicador…). Lo que es de cada persona (ventas, comisiones, notas, números, etapas) no se comparte nunca.</p>
        </div>
      </div>
      <p className="muted">{available === null ? "Consultando…" : `Hay ${available} empresas en el directorio del equipo.`}</p>
      <div className="panel-head-actions">
        <button type="button" className="primary" disabled={busy || !available} onClick={bring}>Traer empresas del equipo</button>
        <button type="button" className="secondary" disabled={busy} onClick={publish}>Publicar mis empresas ({publishableClients(clients).length})</button>
      </div>
      {message && <div className="system-message">{message}</div>}
    </section>
  );
}

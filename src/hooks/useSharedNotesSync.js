import { useEffect, useRef, useState } from "react";
import { rowsSignature, sharedNoteRows } from "../team-shared-notes.mjs";

// 23/10: copia lo que anota esta persona a team_shared_notes (ver src/team-shared-notes.mjs), 30 s después
// del último cambio y solo si cambió algo. Si la tabla todavía no existe o falla, no insiste en la sesión.
const WAIT = 30000;
const CHUNK = 250;

// enabled = el espacio ya bajó de la nube (si no, con el espacio vacío borraría lo compartido).
export function useSharedNotesSync(supabase, email, name, data, enabled = true) {
  const last = useRef("");
  const off = useRef(false);
  const { clients, interactions, prospects } = data || {};
  useEffect(() => {
    if (!enabled || !supabase?.from || !email || off.current) return undefined;
    const timer = setTimeout(async () => {
      const rows = sharedNoteRows({ clients, interactions, prospects }, { email, name });
      const signature = rowsSignature(rows);
      if (signature === last.current) return;
      const syncedAt = new Date().toISOString();
      try {
        for (let index = 0; index < rows.length; index += CHUNK) {
          const { error } = await supabase.from("team_shared_notes").upsert(rows.slice(index, index + CHUNK).map((row) => ({ ...row, synced_at: syncedAt })), { onConflict: "id" });
          if (error) throw error;
        }
        // Lo que esta persona borró de su espacio también se va de lo compartido.
        const { error } = await supabase.from("team_shared_notes").delete().eq("author_email", rows[0]?.author_email || String(email).toLowerCase()).lt("synced_at", syncedAt);
        if (error) throw error;
        last.current = signature;
      } catch {
        off.current = true;
      }
    }, WAIT);
    return () => clearTimeout(timer);
  }, [enabled, supabase, email, name, clients, interactions, prospects]);
}

// Lo que anotaron los DEMÁS (lo propio ya está en el espacio de cada uno). kind: "notas" o "contactos".
export function useTeamSharedNotes(supabase, { kind = "notas", sinceIso = "", limit = 2000 } = {}) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!supabase?.from || !supabase?.auth) return undefined;
    let active = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getSession();
        const me = String(auth?.session?.user?.email || "").toLowerCase();
        let query = supabase.from("team_shared_notes").select("author_email,author_name,kind,company,note,outcome,noted_at");
        query = kind === "contactos" ? query.eq("kind", "contacto") : query.neq("kind", "contacto");
        if (sinceIso) query = query.gte("noted_at", sinceIso);
        const { data, error } = await query.neq("author_email", me).order("noted_at", { ascending: false }).limit(limit);
        if (active && !error) setRows(data || []);
      } catch {
        // Sin la tabla (todavía no se aplicó la migración) queda vacío.
      }
    })();
    return () => { active = false; };
  }, [supabase, kind, sinceIso, limit]);
  return rows;
}

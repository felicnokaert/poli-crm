// Poliplast App (25/11): dónde se guarda Equipo y cuentas.
// - Prueba / sin base: en este navegador (localStorage).
// - App real: rol en app_user_roles (tabla nueva, se aplica con el OK de Felipe) y lo sumado/sacado en module_access.
//   Si app_user_roles todavía no existe, se avisa y los roles no se guardan (lo de module_access sí).
import { useCallback, useEffect, useState } from "react";
import { loadLocalTeam, overrideChanges, overridesFromRows, saveLocalTeam } from "./team-access.mjs";

export function useTeamStore({ online = false, supabase = null, isAdmin = false } = {}) {
  const [team, setTeam] = useState(() => (online ? [] : loadLocalTeam()));
  const [status, setStatus] = useState(online ? "cargando" : "local");
  const [rolesTable, setRolesTable] = useState(!online);

  useEffect(() => {
    if (!online || !supabase || !isAdmin) return undefined;
    let alive = true;
    (async () => {
      const [users, roles, access] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("app_user_roles").select("email, role, full_name"),
        supabase.from("module_access").select("email, module, allowed"),
      ]);
      if (!alive) return;
      setRolesTable(!roles.error);
      const byEmail = new Map();
      for (const user of users.data || []) byEmail.set(String(user.email).toLowerCase(), { email: String(user.email).toLowerCase(), name: user.name || user.email, role: "", registered: true });
      for (const row of roles.data || []) {
        const email = String(row.email).toLowerCase();
        byEmail.set(email, { ...(byEmail.get(email) || { email, name: row.full_name || email, registered: false }), role: row.role });
      }
      for (const person of byEmail.values()) person.overrides = overridesFromRows((access.data || []).filter((row) => String(row.email).toLowerCase() === person.email));
      setTeam([...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name)));
      setStatus(users.error ? "error" : "listo");
    })().catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, [online, supabase, isAdmin]);

  const save = useCallback(async (next) => {
    const before = new Map(team.map((person) => [person.email, person]));
    setTeam(next);
    if (!online) { saveLocalTeam(next); return { ok: true }; }
    try {
      for (const person of next) {
        const old = before.get(person.email);
        if (!old || old.role !== person.role) {
          if (rolesTable && person.role) {
            const { error } = await supabase.from("app_user_roles").upsert({ email: person.email, role: person.role, full_name: person.name || "", updated_at: new Date().toISOString() });
            if (error) throw error;
          }
        }
        const { upserts, deletes } = overrideChanges(old?.overrides, person.overrides);
        if (upserts.length) {
          const { error } = await supabase.from("module_access").upsert(upserts.map((row) => ({ email: person.email, ...row, updated_at: new Date().toISOString() })));
          if (error) throw error;
        }
        if (deletes.length) {
          const { error } = await supabase.from("module_access").delete().eq("email", person.email).in("module", deletes);
          if (error) throw error;
        }
      }
      return { ok: true };
    } catch (error) {
      setTeam([...before.values()]);
      return { ok: false, error: error?.message || "No se pudo guardar." };
    }
  }, [team, online, supabase, rolesTable]);

  return { team, save, status, rolesTable };
}

// Lo que ve la persona que entró (app real): su rol y lo que se le sumó o sacó.
export function useMyAccess({ online = false, supabase = null, email = "" } = {}) {
  const [access, setAccess] = useState({ role: "", overrides: {} });
  useEffect(() => {
    if (!online || !supabase || !email) return undefined;
    let alive = true;
    const who = String(email).toLowerCase();
    Promise.all([
      supabase.from("app_user_roles").select("role").eq("email", who).maybeSingle(),
      supabase.from("module_access").select("module, allowed").eq("email", who),
    ]).then(([role, rows]) => {
      if (alive) setAccess({ role: role.error ? "" : role.data?.role || "", overrides: rows.error ? {} : overridesFromRows(rows.data) });
    }).catch(() => {});
    return () => { alive = false; };
  }, [online, supabase, email]);
  return access;
}

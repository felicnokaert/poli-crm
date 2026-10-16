import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Plus, Search, Trash2 } from "lucide-react";
import { buildBoard, groupConversations, loadByMember, suggestedReply, waitingLabel } from "./team-inbox.mjs";

const STATUSES = [["pendiente", "Pendiente"], ["derivada", "Derivada"], ["respondida", "Respondida"], ["cerrada", "Cerrada"]];
const CHANNEL_LABEL = { general: "WhatsApp General", juan: "WhatsApp Juan", penosil: "WhatsApp Penosil", rapyp: "WhatsApp RAPYP" };

export function TeamInbox({ api, userEmail, isAdmin }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ view: "abiertas", member: "", channel: "", query: "" });
  const [openReply, setOpenReply] = useState("");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", email: "" });
  const [newRule, setNewRule] = useState({ kind: "canal", value: "", member_id: "" });

  const refresh = useCallback(async () => {
    if (!api) { setState({ members: [], rules: [], assignments: [], events: [], statusEvents: [] }); return; }
    try { setState(await api.load()); setError(""); } catch { setError("No se pudo cargar la bandeja del equipo."); setState({ members: [], rules: [], assignments: [], events: [], statusEvents: [] }); }
  }, [api]);
  useEffect(() => { refresh(); }, [refresh]);

  const members = useMemo(() => state?.members || [], [state]);
  const activeMembers = members.filter((member) => member.active);
  const me = members.find((member) => member.email && member.email === String(userEmail || "").toLowerCase());
  const board = useMemo(() => state ? buildBoard(groupConversations(state.events, state.statusEvents), state.assignments, state.rules, members) : [], [state, members]);
  const load = useMemo(() => loadByMember(board, activeMembers), [board, activeMembers]);
  const channels = [...new Set(board.map((item) => item.channel))];
  const q = filters.query.trim().toLowerCase();
  const shown = board.filter((item) =>
    (filters.view === "todas" || item.open)
    && (!filters.member || (filters.member === "sin" ? !item.memberId : item.memberId === filters.member))
    && (!filters.channel || item.channel === filters.channel)
    && (!q || `${item.customerName} ${item.customerWaId} ${item.lastText}`.toLowerCase().includes(q)));
  const nameOf = (id) => members.find((member) => member.id === id)?.name || "";

  async function save(item, patch) {
    try { await api.assign(item, patch, userEmail); await refresh(); } catch { setMessage("No se pudo guardar el cambio."); }
  }
  async function applySuggestions() {
    const pending = board.filter((item) => item.open && !item.memberId && item.suggestedId);
    try { for (const item of pending) await api.assign(item, { member_id: item.suggestedId, status: item.status === "respondida" ? "respondida" : "pendiente" }, userEmail); setMessage(`Se asignaron ${pending.length} conversaciones según las reglas.`); await refresh(); } catch { setMessage("No se pudieron aplicar las sugerencias."); }
  }
  async function copyReply(item) {
    const reply = suggestedReply(item, me?.name || "");
    try { await navigator.clipboard.writeText(reply.text); setMessage("Respuesta copiada. Revisala y mandala vos desde WhatsApp."); } catch { setMessage("No se pudo copiar: seleccioná el texto."); }
  }
  async function admin(action) {
    try { await action(); await refresh(); } catch { setMessage("No se pudo guardar. Solo el administrador edita el equipo y las reglas."); }
  }

  return (
    <section className="panel team-inbox">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Equipo</span>
          <h2>Bandeja del equipo</h2>
          <p>Todo lo que entra, quién lo tiene y qué sigue pendiente. El CRM no envía mensajes: la respuesta sugerida se copia y la manda cada persona.</p>
        </div>
        {isAdmin && <button type="button" className="secondary" onClick={() => setRosterOpen(!rosterOpen)}>Equipo y reglas</button>}
      </div>
      {message && <div className="system-message">{message}</div>}
      {error && <div className="system-message">{error}</div>}
      {!api && <p className="muted">La bandeja del equipo está disponible en la versión en línea.</p>}
      {state === null && <p className="muted">Cargando…</p>}

      {state && (
        <>
          <div className="team-chips">
            <button type="button" className={!filters.member ? "selected" : ""} onClick={() => setFilters({ ...filters, member: "" })}>Todos</button>
            {activeMembers.map((member) => (
              <button type="button" key={member.id} className={filters.member === member.id ? "selected" : ""} onClick={() => setFilters({ ...filters, member: member.id })}>{member.name} <b>{load.counts.get(member.id) || 0}</b></button>
            ))}
            <button type="button" className={filters.member === "sin" ? "selected" : ""} onClick={() => setFilters({ ...filters, member: "sin" })}>Sin asignar <b>{load.unassigned}</b></button>
          </div>
          <div className="panel-head-actions team-filters">
            <label className="search"><Search size={16} /><input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Buscar cliente o mensaje…" /></label>
            <select aria-label="Ver" value={filters.view} onChange={(event) => setFilters({ ...filters, view: event.target.value })}><option value="abiertas">Abiertas</option><option value="todas">Todas</option></select>
            <select aria-label="Canal" value={filters.channel} onChange={(event) => setFilters({ ...filters, channel: event.target.value })}><option value="">Todos los canales</option>{channels.map((key) => <option key={key} value={key}>{CHANNEL_LABEL[key] || key}</option>)}</select>
            {board.some((item) => item.open && !item.memberId && item.suggestedId) && <button type="button" className="secondary" onClick={applySuggestions}>Asignar según reglas</button>}
          </div>

          {shown.length === 0 && <p className="muted">No hay conversaciones con estos filtros.</p>}
          <div className="team-list">
            {shown.slice(0, 100).map((item) => {
              const reply = openReply === item.key ? suggestedReply(item, me?.name || "") : null;
              return (
                <article key={item.key} className={`team-row${item.open ? "" : " done"}`}>
                  <div className="team-main">
                    <strong>{item.customerName || item.customerWaId}</strong>
                    <span className="muted small">{CHANNEL_LABEL[item.channel] || item.channel} · {item.customerWaId} · hace {waitingLabel(item.lastAt)} · {item.messages} {item.messages === 1 ? "mensaje" : "mensajes"}</span>
                    <p>{item.lastText || "(sin texto)"}</p>
                    {item.note && <span className="muted small">Nota: {item.note}</span>}
                    {reply && (
                      <div className="team-reply">
                        <p className="muted small">Respuesta sugerida ({reply.title}){reply.validate.length ? ` · validá: ${reply.validate.join(", ")}` : ""}</p>
                        <blockquote className="reply-template">{reply.text}</blockquote>
                        <div className="panel-head-actions"><button type="button" className="primary" onClick={() => copyReply(item)}><Copy size={14} /> Copiar respuesta</button></div>
                      </div>
                    )}
                  </div>
                  <div className="team-controls">
                    <select aria-label={`Asignar ${item.customerName || item.customerWaId}`} value={item.memberId || ""} onChange={(event) => save(item, { member_id: event.target.value || null })}>
                      <option value="">{item.suggestedId ? `Sin asignar (sugerido: ${nameOf(item.suggestedId)})` : "Sin asignar"}</option>
                      {activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                    </select>
                    <select aria-label={`Estado de ${item.customerName || item.customerWaId}`} value={item.status} onChange={(event) => save(item, { status: event.target.value })}>
                      {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <button type="button" className="secondary" onClick={() => setOpenReply(openReply === item.key ? "" : item.key)}>{reply ? "Ocultar" : "Respuesta sugerida"}</button>
                  </div>
                </article>
              );
            })}
          </div>

          {isAdmin && rosterOpen && (
            <div className="team-admin">
              <h3>Equipo</h3>
              <p className="muted small">Sumá o desactivá personas cuando entran o se van. El email es el de su usuario del CRM (para saber quién es cada uno).</p>
              {members.map((member) => (
                <div key={member.id} className="team-member-row">
                  <strong>{member.name}</strong>
                  <input aria-label={`Email de ${member.name}`} defaultValue={member.email || ""} placeholder="email del CRM" onBlur={(event) => { const value = event.target.value.trim().toLowerCase(); if (value !== (member.email || "")) admin(() => api.updateMember(member.id, { email: value || null })); }} />
                  <label><input type="checkbox" checked={member.active} onChange={(event) => admin(() => api.updateMember(member.id, { active: event.target.checked }))} /> activo</label>
                </div>
              ))}
              <div className="team-member-row">
                <input aria-label="Nombre nuevo" value={newMember.name} onChange={(event) => setNewMember({ ...newMember, name: event.target.value })} placeholder="Nombre" />
                <input aria-label="Email nuevo" value={newMember.email} onChange={(event) => setNewMember({ ...newMember, email: event.target.value })} placeholder="email (opcional)" />
                <button type="button" className="secondary" disabled={!newMember.name.trim()} onClick={() => admin(async () => { await api.addMember({ name: newMember.name.trim(), email: newMember.email.trim().toLowerCase() || null }); setNewMember({ name: "", email: "" }); })}><Plus size={14} /> Sumar</button>
              </div>
              <h3>Reglas de reparto</h3>
              <p className="muted small">Una regla por canal (ej. el canal "juan" va a Juan) o por palabra del mensaje (ej. "náutica" va a Ezequiel). Las de palabra ganan sobre las de canal.</p>
              {state.rules.map((rule) => (
                <div key={rule.id} className="team-member-row">
                  <span>{rule.kind === "canal" ? "Canal" : "Palabra"}: <strong>{rule.value}</strong> → {nameOf(rule.member_id)}</span>
                  <button type="button" className="link-button" aria-label={`Quitar regla ${rule.value}`} onClick={() => admin(() => api.removeRule(rule.id))}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="team-member-row">
                <select aria-label="Tipo de regla" value={newRule.kind} onChange={(event) => setNewRule({ ...newRule, kind: event.target.value })}><option value="canal">Canal</option><option value="palabra">Palabra</option></select>
                <input aria-label="Valor de la regla" value={newRule.value} onChange={(event) => setNewRule({ ...newRule, value: event.target.value })} placeholder={newRule.kind === "canal" ? "ej. juan" : "ej. náutica"} />
                <select aria-label="Persona de la regla" value={newRule.member_id} onChange={(event) => setNewRule({ ...newRule, member_id: event.target.value })}><option value="">¿A quién?</option>{activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
                <button type="button" className="secondary" disabled={!newRule.value.trim() || !newRule.member_id} onClick={() => admin(async () => { await api.addRule({ kind: newRule.kind, value: newRule.kind === "canal" ? newRule.value.trim().toLowerCase() : newRule.value.trim(), member_id: newRule.member_id }); setNewRule({ kind: "canal", value: "", member_id: "" }); })}><Plus size={14} /> Sumar regla</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

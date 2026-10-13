import { useCallback, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { supabase } from "./online";
import { useConfirm } from "./ConfirmDialog";
import { canDeleteChannel, parseMemberEmails, slugifyChannelKey, validateChannelDraft } from "./channel-admin.mjs";

const EMPTY_DRAFT = { label: "", displayNumber: "", phoneNumberId: "", membersText: "", color: "" };

// Panel para asignar canales de WhatsApp a comerciales sin tocar codigo. Solo
// se muestra a quien administra canales (la base lo exige igual: RLS).
export function ChannelsAdmin() {
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingKey, setEditingKey] = useState(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from("whatsapp_channels").select("*").order("channel_key");
    if (error) {
      setIsError(true);
      setMessage("No se pudieron leer los canales. ¿Ya se aplicó la migración de canales en Supabase?");
      return;
    }
    setRows(data || []);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function say(text, error = false) {
    setMessage(text);
    setIsError(error);
  }

  function startEdit(row) {
    setEditingKey(row.channel_key);
    setDraft({
      label: row.label || "",
      displayNumber: row.display_number || "",
      phoneNumberId: row.phone_number_id || "",
      membersText: (row.member_emails || []).join(", "),
      color: row.color || "",
    });
    say("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft(EMPTY_DRAFT);
  }

  async function save(event) {
    event.preventDefault();
    const { errors, members, phoneId, label, color } = validateChannelDraft(draft, { existing: rows, editingKey });
    if (errors.length) return say(errors.join(" "), true);
    setBusy(true);
    const values = {
      label,
      display_number: draft.displayNumber.trim() || null,
      phone_number_id: phoneId || null,
      color: color || null,
      member_emails: members,
      updated_at: new Date().toISOString(),
    };
    const request = editingKey
      ? supabase.from("whatsapp_channels").update(values).eq("channel_key", editingKey)
      : supabase.from("whatsapp_channels").insert({ channel_key: slugifyChannelKey(label, rows.map((row) => row.channel_key)), ...values });
    const { error } = await request;
    setBusy(false);
    if (error) return say(`No se pudo guardar: ${error.message}`, true);
    say(editingKey ? "Canal actualizado. Cada persona lo ve la próxima vez que abra el CRM." : "Canal creado. Cada persona lo ve la próxima vez que abra el CRM.");
    cancelEdit();
    reload();
  }

  async function remove(row) {
    if (!canDeleteChannel(row.channel_key)) return;
    const ok = await confirm(`¿Eliminar el canal "${row.label}"? Los mensajes ya recibidos no se borran, pero nadie lo va a ver.`, { confirmLabel: "Eliminar canal" });
    if (!ok) return;
    const { error } = await supabase.from("whatsapp_channels").delete().eq("channel_key", row.channel_key);
    if (error) return say(`No se pudo eliminar: ${error.message}`, true);
    say("Canal eliminado.");
    reload();
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Administración</span>
          <h2>Canales de WhatsApp</h2>
        </div>
        <Link2 size={20} />
      </div>
      <p>
        Asigná cada número a quien lo usa. Quien no figure en ningún canal usa el CRM
        sin ver chats. El ID del número sale de Meta (WhatsApp Manager); sin ID el
        canal queda creado pero todavía no recibe mensajes.
      </p>
      <div className="content-stack">
        {rows.map((row) => (
          <div className="day-mode-item" key={row.channel_key}>
            <div>
              <strong>{row.label}</strong> <small>({row.channel_key})</small>
              <p>
                {row.display_number || "sin número visible"} · ID Meta: {row.phone_number_id || "se resuelve por configuración"}
                <br />
                Miembros: {(row.member_emails || []).join(", ") || "nadie"}
              </p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => startEdit(row)}>Editar</button>
              {canDeleteChannel(row.channel_key) && (
                <button type="button" className="link-button" onClick={() => remove(row)}>Eliminar</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <form className="form-grid" onSubmit={save}>
        <label>
          Nombre del canal
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="WhatsApp RAPYP" />
        </label>
        <label>
          Número visible
          <input value={draft.displayNumber} onChange={(e) => setDraft({ ...draft, displayNumber: e.target.value })} placeholder="+54 9 11 6856-5952" />
        </label>
        <label>
          ID del número en Meta
          <input value={draft.phoneNumberId} inputMode="numeric" onChange={(e) => setDraft({ ...draft, phoneNumberId: e.target.value })} placeholder="solo dígitos" />
        </label>
        <label>
          Color (opcional)
          <input value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} placeholder="#0d7764" />
        </label>
        <label className="span-2">
          Quién lo usa (correos separados por coma)
          <input value={draft.membersText} onChange={(e) => setDraft({ ...draft, membersText: e.target.value })} placeholder="comercial@grupopoliplast.com.ar" />
        </label>
        <div className="modal-actions span-2">
          {editingKey && <button type="button" className="secondary" onClick={cancelEdit}>Cancelar</button>}
          <button className="primary" type="submit" disabled={busy}>{editingKey ? "Guardar cambios" : "Crear canal"}</button>
        </div>
      </form>
      {message && <div className={`system-message${isError ? " error" : ""}`}>{message}</div>}
    </section>
  );
}

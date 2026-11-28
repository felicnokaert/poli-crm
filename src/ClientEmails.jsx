import { useEffect, useMemo, useState } from "react";
import { Copy, Mail } from "lucide-react";
import { askText, contabiliumIndex, emailsOfClient, splitEmails, contabiliumWithoutEmail, groupByVendor, myClientsWithoutEmail, normalizeEmail } from "./client-emails.mjs";
import { useContabiliumEmails } from "./hooks/useContabiliumEmails.js";

// Empresas → «Sin mail» (27/11). Cada comercial ve los clientes de SU cartera sin mail y lo carga; los administradores
// además ven los clientes de Contabilium que compraron en 12 meses sin mail, por vendedor, con el texto para pedírselo.
function EmailRow({ row, onSave, onOpen }) {
  const [value, setValue] = useState(row.suggested || "");
  const mail = normalizeEmail(value);
  return (
    <li className="mail-row">
      <button type="button" className="link-button" onClick={() => onOpen?.(row.id)}><strong>{row.name}</strong></button>
      <span className="muted small">{[row.cuit && `CUIT ${row.cuit}`, row.phone].filter(Boolean).join(" · ")}{row.suggested ? ` · Contabilium tiene ${row.suggested}` : ""}</span>
      <span className="mail-row-input">
        <input type="email" value={value} onChange={(event) => setValue(event.target.value)} placeholder="mail del cliente" aria-label={`Mail de ${row.name}`} />
        <button type="button" className="secondary" disabled={!mail} onClick={() => onSave?.(row.id, mail)}>Guardar</button>
      </span>
    </li>
  );
}

export function ClientEmails({ clients = [], supabase = null, isAdmin = false, onSaveEmail, onOpenClient, vendorNames = {}, onVendorNames }) {
  const { clients: contab, invoices, error, loading } = useContabiliumEmails({ supabase, withInvoices: isAdmin });
  const index = useMemo(() => (contab ? contabiliumIndex(contab) : null), [contab]);
  const mine = useMemo(() => myClientsWithoutEmail(clients, index), [clients, index]);
  const adminView = useMemo(() => (isAdmin && contab && invoices ? contabiliumWithoutEmail({ invoices, clients: contab, crmClients: clients, vendorNames }) : null), [isAdmin, contab, invoices, clients, vendorNames]);
  const groups = useMemo(() => (adminView ? groupByVendor(adminView.rows) : []), [adminView]);
  const [vendor, setVendor] = useState("");
  const [copied, setCopied] = useState("");
  const current = groups.find((group) => group.vendor === vendor) || groups[0];
  const copy = async (group) => {
    try { await navigator.clipboard.writeText(askText(group)); setCopied(group.vendor); setTimeout(() => setCopied(""), 2000); } catch { /* sin portapapeles */ }
  };
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Empresas</span><h2>Clientes de tu cartera sin mail</h2></div><span className="badge">{mine.length}</span></div>
        <p className="muted small">No tienen mail en la ficha ni en sus contactos. Pedíselo cuando les pases un presupuesto o una factura y cargalo acá. Si Contabilium ya tiene uno, aparece sugerido: revisalo antes de guardar.</p>
        {mine.length === 0 ? <p className="muted">Todos tus clientes tienen mail. 👏</p> : (
          <ul className="mail-list">{mine.slice(0, 200).map((row) => <EmailRow key={row.id} row={row} onSave={onSaveEmail} onOpen={onOpenClient} />)}</ul>
        )}
        {mine.length > 200 ? <p className="muted small">Se muestran los primeros 200 de {mine.length}.</p> : null}
      </section>
      {isAdmin && (
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Administración</span><h2>Contabilium: compraron en 12 meses y no tienen mail</h2></div></div>
          {loading && !adminView ? <p className="muted">Leyendo Contabilium…</p> : error ? <p className="form-notice">{error}</p> : !adminView ? null : (
            <>
              <p className="muted small">{adminView.rows.length} de {adminView.total} clientes con FC o COT en 12 meses no tienen mail en Contabilium{adminView.noFicha ? ` (${adminView.noFicha} sin ficha copiada todavía)` : ""}. Se agrupan por el vendedor del último comprobante. Contabilium manda el vendedor como número: poné el nombre una vez y queda.</p>
              <div className="segmented mail-vendors" role="tablist" aria-label="Vendedor">
                {groups.map((group) => <button key={group.vendor} type="button" role="tab" aria-selected={current?.vendor === group.vendor} className={current?.vendor === group.vendor ? "selected" : ""} onClick={() => setVendor(group.vendor)}>{group.name} · {group.rows.length}</button>)}
              </div>
              {current && (
                <>
                  <div className="mail-vendor-head">
                    {current.vendor !== "0" && <label className="small">Nombre del vendedor {current.vendor}: <input defaultValue={vendorNames[current.vendor] || ""} placeholder="ej. Brenda" onBlur={(event) => { const name = event.target.value.trim(); if (name !== (vendorNames[current.vendor] || "")) onVendorNames?.({ ...vendorNames, [current.vendor]: name }); }} /></label>}
                    <button type="button" className="secondary" onClick={() => copy(current)}><Copy size={14} /> {copied === current.vendor ? "Copiado" : "Copiar lista para pedírselos"}</button>
                  </div>
                  <ul className="mail-list">
                    {current.rows.slice(0, 150).map((row) => (
                      <li key={row.key} className="mail-row">
                        <strong>{row.name}</strong>
                        <span className="muted small">{row.company} · {[row.cuit && `CUIT ${row.cuit}`, row.phone].filter(Boolean).join(" · ")} · última {row.lastType} {row.lastAt}</span>
                        {row.suggested ? <span className="small"><Mail size={12} /> {row.suggested} <span className="muted">({row.suggestedFrom}: cargalo en Contabilium)</span></span> : null}
                      </li>
                    ))}
                  </ul>
                  {current.rows.length > 150 ? <p className="muted small">Se muestran 150 de {current.rows.length}; la lista copiada trae los primeros 40.</p> : null}
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

// Aviso dentro de la ficha del cliente: si no tiene mail, se pide y se carga ahí mismo. Si Contabilium tiene uno
// (mismo CUIT), se sugiere; nunca se guarda solo.
export function MissingEmailNotice({ client, supabase = null, onSave }) {
  const [value, setValue] = useState("");
  const [suggested, setSuggested] = useState("");
  const cuit = String(client?.cuit || "").replace(/\D/g, "");
  useEffect(() => {
    if (!supabase?.from || cuit.length !== 11) return undefined;
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from("contabilium_clientes").select("email,cuit").or(`cuit.eq.${cuit},cuit.eq.${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`).limit(5);
        const found = (data || []).flatMap((row) => splitEmails(row.email))[0] || "";
        if (alive && found) { setSuggested(found); setValue((current) => current || found); }
      } catch { /* sin Contabilium */ }
    })();
    return () => { alive = false; };
  }, [supabase, cuit]);
  if (!client || emailsOfClient(client).length) return null;
  const mail = normalizeEmail(value);
  return (
    <div className="form-notice mail-missing">
      <strong>Este cliente no tiene mail: pedíselo.</strong> <span className="small">Cuando le pases un presupuesto o una factura.{suggested ? ` Contabilium tiene ${suggested}: revisalo.` : ""}</span>
      <span className="mail-row-input">
        <input type="email" value={value} onChange={(event) => setValue(event.target.value)} placeholder="mail del cliente" aria-label="Mail del cliente" />
        <button type="button" className="secondary" disabled={!mail} onClick={() => onSave?.({ ...client, email: mail })}>Guardar mail</button>
      </span>
    </div>
  );
}

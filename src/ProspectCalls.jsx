import { useMemo, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { callPlan } from "./prospect-calls.mjs";
import { normalizePhoneAR } from "./prospect-contact.mjs";
import { possibleWhatsAppLink, REJECTION_REASONS } from "./prospect-model.mjs";
import { arToday } from "./ar-date.mjs";
import { blockedBy } from "./do-not-contact.mjs";

const FAMILY_TAG = { Penosil: "Pen", Planchas: "Plan", Resinplast: "Res" };

// Prospección → Orden de llamada (12/11): los de prioridad de Limpieza con teléfono, por zona y ciudad. Cada llamada se anota en un toque.
// «Hablé» los pasa a Empresas con su seguimiento (igual que «Contactado»); «No atendió» los vuelve a ofrecer mañana; «No le sirve» los descarta con motivo.
export function ProspectCalls({ prospects, blockList, onResult }) {
  const today = arToday();
  const plan = useMemo(() => callPlan(prospects, { today, blocked: (item) => Boolean(blockedBy({ phone: item.phone, email: item.email, company: item.company }, blockList)) }), [prospects, blockList, today]);
  const [reason, setReason] = useState({});
  const [mail, setMail] = useState({});
  return (
    <section className="panel prospect-calls" aria-label="Orden de llamada">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Llamar de corrido, por zona</span>
          <h2><Phone size={18} aria-hidden="true" /> Orden de llamada</h2>
          <p className="muted small">
            {plan.total} prospectos de <strong>Prioridad</strong> (Limpieza) con teléfono, ordenados por zona y por la ciudad con más prospectos. Hoy anotaste {plan.calledToday} llamadas.
            «Hablé» los pasa a Empresas con su seguimiento; «No atendió» los vuelve a ofrecer mañana; «No le sirve» los descarta con motivo. Pedí siempre el mail y guardalo.
          </p>
        </div>
      </div>
      {!plan.total && <p className="muted">No quedan prospectos de prioridad con teléfono para llamar hoy.</p>}
      {plan.zones.map((zone, index) => (
        <details key={zone.id} className="call-zone" open={index === 0}>
          <summary><strong>{zone.name}</strong> <span className="muted small">· {zone.total} para llamar</span></summary>
          {zone.cities.map((city) => (
            <div key={`${city.city}|${city.province}`} className="call-city">
              <h4>{city.city} <span className="muted small">{city.province && city.province !== city.city ? `${city.province} · ` : ""}{city.count}</span></h4>
              {city.items.map(({ prospect, contact, attempts }) => {
                const phone = normalizePhoneAR(prospect.phone);
                const wa = contact === "celular" ? possibleWhatsAppLink(phone.e164 || prospect.phone) : "";
                return (
                  <article key={prospect.id} className="call-row">
                    <div className="call-main">
                      <strong>{prospect.company}</strong>
                      <span className="muted small">{[FAMILY_TAG[prospect.family] || prospect.family, prospect.rubro, [...new Set([prospect.city && prospect.city !== city.city ? prospect.city : ""])].filter(Boolean).join("")].filter(Boolean).join(" · ")}</span>
                      <span className="small">
                        {phone.valid ? <a href={`tel:${phone.e164}`}>{prospect.phone}</a> : prospect.phone}
                        {contact === "celular" && " 📱"}
                        {wa && <> · <a href={wa} target="_blank" rel="noreferrer"><MessageCircle size={13} aria-hidden="true" /> WhatsApp</a></>}
                        {attempts > 0 && <span className="muted"> · {attempts} intento{attempts > 1 ? "s" : ""} sin respuesta</span>}
                      </span>
                      {prospect.email && <span className="small muted">Mail: {prospect.email}</span>}
                    </div>
                    <div className="call-actions">
                      <input type="email" aria-label={`Mail de ${prospect.company}`} placeholder="Mail que te pasaron" value={mail[prospect.id] ?? ""} onChange={(event) => setMail({ ...mail, [prospect.id]: event.target.value })} onBlur={() => { if ((mail[prospect.id] || "").trim()) { onResult(prospect.id, "mail", { email: mail[prospect.id] }); setMail({ ...mail, [prospect.id]: "" }); } }} />
                      <button type="button" className="primary" onClick={() => onResult(prospect.id, "hablamos", { email: mail[prospect.id] })}>Hablé</button>
                      <button type="button" className="secondary" onClick={() => onResult(prospect.id, "no-atendio", { email: mail[prospect.id] })}>No atendió</button>
                      <select aria-label="Motivo si no le sirve" value={reason[prospect.id] || ""} onChange={(event) => { const value = event.target.value; setReason({ ...reason, [prospect.id]: "" }); if (value) onResult(prospect.id, "sin-interes", { outcome: value }); }}>
                        <option value="">No le sirve…</option>
                        {REJECTION_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>
                  </article>
                );
              })}
            </div>
          ))}
        </details>
      ))}
    </section>
  );
}

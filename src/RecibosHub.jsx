import { ExternalLink } from "lucide-react";
import { RECIBOS_LINKS, RECIBOS_URL } from "./poliplast-app-plan.mjs";
import { accessAllows } from "./team-access.mjs";

// Recibos (28/11): accesos a cada sección de PoliRecibos, en pestaña nueva (puente hasta tener las pantallas propias).
// Se entra con el mismo mail @grupopoliplast.com.ar; la primera vez Recibos pide crear la cuenta (/registro).
export function RecibosHub({ access = null }) {
  const links = RECIBOS_LINKS.filter(([label]) => !access || accessAllows(access, "recibos", label));
  return (
    <section className="panel recibos-hub">
      <span className="eyebrow">Administración</span>
      <h2>Recibos</h2>
      <p className="muted small">Cada sección se abre en una pestaña nueva de PoliRecibos. Entrá con tu mail de la empresa; si es la primera vez, creá la cuenta ahí mismo.</p>
      <div className="recibos-grid">
        {links.map(([label, path, text]) => (
          <a key={path} className="recibos-card" href={`${RECIBOS_URL}${path}`} target="_blank" rel="noreferrer">
            <strong>{label} <ExternalLink size={13} aria-hidden="true" /></strong>
            <span className="muted small">{text}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

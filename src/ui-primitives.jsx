import { MessageCircle } from "lucide-react";

export function Goal({ title, text }) {
  return (
    <div>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

export function Empty({ text }) {
  return (
    <div className="empty">
      <MessageCircle size={24} />
      <p>{text}</p>
    </div>
  );
}

// Spinner + Loading reutilizables: hasta ahora casi ningún punto de la app
// mostraba algo mientras esperaba una respuesta de Supabase, así que se
// percibía como colgada. Un solo componente CSS (sin librerías) para no
// terminar con 3 variantes de "cargando" distintas por archivo.
export function Spinner({ size = 18 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export function Loading({ text = "Cargando…" }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <Spinner size={24} />
      <p>{text}</p>
    </div>
  );
}

export function Fact({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value || "A confirmar"}</strong>
    </div>
  );
}

// Recreación en SVG del isologo de Grupo Poliplast (colores reales: rojo +
// gris, no la versión en negro que se usó en un primer intento) armada en 3
// piezas independientes a propósito - a diferencia de un PNG plano, esto
// permite animar SOLO los dos aros (el rojo exterior, con el corte que
// forma la "G", y el gris interior) y dejar la "P" del centro siempre
// quieta, tal como pidió Felipe. `animated` controla si los aros giran
// (pantalla de carga) o quedan fijos (pantalla de error - no hay nada
// "cargando" ahí).
export function PoliplastMark({ animated = false, size = 84 }) {
  return (
    <svg
      className={`poliplast-mark${animated ? " poliplast-mark-animated" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Grupo Poliplast"
    >
      <g className="poliplast-mark-ring poliplast-mark-ring-outer">
        <circle cx="50" cy="50" r="44" fill="none" stroke="#e2231a" strokeWidth="6" strokeLinecap="round" strokeDasharray="230 46" />
      </g>
      <g className="poliplast-mark-ring poliplast-mark-ring-inner">
        <circle cx="50" cy="50" r="33" fill="none" stroke="#a7a9ac" strokeWidth="5" strokeLinecap="round" strokeDasharray="170 37" />
      </g>
      <text x="50" y="67" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="800" fontSize="46" fill="#e2231a">P</text>
    </svg>
  );
}

export function Splash({ text }) {
  return (
    <div className="login-shell" role="status" aria-live="polite">
      <section className="login-card splash-card">
        <PoliplastMark animated />
        <p>{text}</p>
      </section>
    </div>
  );
}

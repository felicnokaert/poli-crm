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

// Isologo REAL de Grupo Poliplast (public/poliplast-isotipo-color.png, el
// archivo que mandó Felipe - no una recreación). Se probó una versión
// animada (2 capas superpuestas con mask-image, para que solo los aros
// giraran y la "P" quedara quieta) pero dejaba una costura visible donde
// se cruzan las dos máscaras - Felipe ya había autorizado este respaldo
// para ese caso exacto: mostrar el logo real fijo, sin animar, antes que
// una animación con un defecto visible.
export function PoliplastMark({ size = 84 }) {
  return (
    <img
      className="poliplast-mark"
      src="/poliplast-isotipo-color.png"
      alt="Grupo Poliplast"
      style={{ width: size, height: size }}
    />
  );
}

export function Splash({ text }) {
  return (
    <div className="login-shell" role="status" aria-live="polite">
      <section className="login-card splash-card">
        <PoliplastMark />
        <p>{text}</p>
      </section>
    </div>
  );
}

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
// archivo que mandó Felipe - no una recreación). Un PNG plano no permite
// animar partes por separado, así que se usan 2 copias superpuestas de la
// MISMA imagen, cada una recortada con una máscara circular (mask-image +
// radial-gradient): una muestra solo el centro (la "P", siempre quieta),
// la otra muestra solo el resto hacia afuera (los aros rojo y gris, que
// giran juntos cuando `animated` es true). Como las dos capas son
// literalmente los mismos píxeles del archivo real, en reposo se ve
// idéntico al logo original - no hay ningún color ni forma inventada acá.
// Si esta técnica de máscaras no rinde bien en algún navegador, Felipe
// pidió como respaldo dejarlo fijo (animated=false) antes que una
// animación que se vea mal.
export function PoliplastMark({ animated = false, size = 84 }) {
  return (
    <span
      className="poliplast-mark"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Grupo Poliplast"
    >
      <img
        className={`poliplast-mark-layer poliplast-mark-layer-rings${animated ? " poliplast-mark-animated" : ""}`}
        src="/poliplast-isotipo-color.png"
        alt=""
        aria-hidden="true"
      />
      <img className="poliplast-mark-layer poliplast-mark-layer-letter" src="/poliplast-isotipo-color.png" alt="" aria-hidden="true" />
    </span>
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

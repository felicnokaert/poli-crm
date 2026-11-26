import { useState } from "react";
import { SUBMODULES } from "./poliplast-app-plan.mjs";
import { accessAllows } from "./team-access.mjs";

// Poliplast App (prueba, 25/11): muestra la maqueta REAL de otra app (con su propio diseño y datos de ejemplo)
// adentro del menú. Solo en el link de prueba; en la app real cada módulo usa su app de verdad.
export function MaquetaFrame({ src, title, children = null }) {
  return (
    <section className="maqueta-frame">
      <p className="muted small">Versión de prueba · {title} con su diseño de siempre y datos de ejemplo.</p>
      {children}
      <iframe src={src} title={title} loading="eager" />
    </section>
  );
}

// App de conteo (otro repositorio): cada submódulo abre su pestaña directo por hash (#etiquetas/devoluciones).
export const CONTEO_MODULES = {
  etiquetas: { title: "Etiquetas", hash: (sub) => `etiquetas/${sub}` },
  conteo: { title: "Conteo", hash: () => "conteo" },
  dosificado: { title: "Dosificado", hash: (sub) => `dosificado/${sub}` },
};
const HASH_OF = { Escanear: "escanear", Pendientes: "pendientes", Hecho: "hecho", Devoluciones: "devoluciones", Cortes: "cortes", Cargar: "cargar", Kits: "kits", Registros: "registros", Resumen: "resumen" };

export function ConteoMaqueta({ module, access = null, who = null }) {
  const info = CONTEO_MODULES[module];
  const subs = (SUBMODULES[module] || []).filter((sub) => !access || accessAllows(access, module, sub));
  const [picked, setPicked] = useState(subs[0] || "");
  const sub = subs.includes(picked) ? picked : subs[0] || "";
  const params = new URLSearchParams({ embebida: "1", persona: who?.who || "Marcos", deposito: who?.deposit || "Villa Domínico" });
  const src = `/conteo-maqueta/?${params}#${info.hash(HASH_OF[sub] || "")}`;
  return (
    <MaquetaFrame src={src} title={info.title}>
      {module !== "conteo" && subs.length > 1 && (
        <div className="segmented demo-tabs" role="tablist" aria-label={`Submódulos de ${info.title}`}>
          {subs.map((item) => <button key={item} type="button" role="tab" aria-selected={sub === item} className={sub === item ? "selected" : ""} onClick={() => setPicked(item)}>{item}</button>)}
        </div>
      )}
      {module === "conteo" && <p className="muted small">La Administración de Conteo se abre desde la pestaña de abajo con el PIN de ejemplo 1234.</p>}
    </MaquetaFrame>
  );
}

// Poliplast App (prueba, 25/11): muestra la maqueta REAL de otra app (con su propio diseño y datos de ejemplo)
// adentro del menú. Solo en el link de prueba; en la app real cada módulo usa su app de verdad.
export function MaquetaFrame({ src, title }) {
  return (
    <section className="maqueta-frame">
      <p className="muted small">Versión de prueba · {title} con su diseño de siempre y datos de ejemplo.</p>
      <iframe src={src} title={title} loading="eager" />
    </section>
  );
}

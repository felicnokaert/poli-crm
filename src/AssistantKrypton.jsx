import { kryptonAdvice } from "./assistant-krypton.mjs";

const fmt = (value) => Number(value).toLocaleString("es-AR", { maximumFractionDigits: 2 });

// Tabla de materiales del sistema Krypton: kg a usar y kit cerrado, por capa.
export function AssistantKrypton({ quote }) {
  if (!quote) return null;
  return (
    <section className="assistant-answer" aria-label="Cotización Krypton">
      <span className="assistant-group-label">Krypton · {fmt(quote.m2)} m²</span>
      <p className="muted small">{quote.label}{quote.explicit ? "" : ". No aclaraste si lleva top: lo calculé con top, mirá también sin top."}</p>
      <div className="table-scroll"><table className="sales-history-table">
        <thead><tr><th>Producto</th><th>Kg a usar</th><th>Kit cerrado</th><th>Kg en kits</th><th>Sobra</th></tr></thead>
        <tbody>
          {quote.rows.map((row) => (
            <tr key={row.key}><td><strong>{row.step}</strong> {row.name}{row.parts ? <><br /><span className="muted small">{row.parts}</span></> : null}</td><td>{fmt(row.kgToUse)} kg</td><td>{row.kitLabel}</td><td>{fmt(row.closedKg)} kg</td><td>{fmt(row.leftoverKg)} kg</td></tr>
          ))}
          <tr><td><strong>Total</strong></td><td><strong>{fmt(quote.totalKgToUse)} kg</strong></td><td /><td><strong>{fmt(quote.totalClosedKg)} kg</strong></td><td /></tr>
        </tbody>
      </table></div>
      <ul className="assistant-rivals">{kryptonAdvice(quote).map((line) => <li key={line}>{line}</li>)}</ul>
      <span className="muted small">Sin precios: para el precio armá la cotización en el cotizador.</span>
    </section>
  );
}

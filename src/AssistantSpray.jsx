const fmt = (value) => Number(value).toLocaleString("es-AR", { maximumFractionDigits: 1 });

// Material para una obra de spray: kg de mezcla, poliol e isocianato y sistemas (tambores cerrados).
export function AssistantSpray({ quote }) {
  if (!quote) return null;
  const { ask, systems } = quote;
  return (
    <section className="assistant-answer" aria-label="Cálculo de spray">
      <span className="assistant-group-label">Spray · {fmt(ask.m2)} m²</span>
      <p className="muted small">
        {fmt(ask.m2)} m²{quote.extraPct ? ` + ${quote.extraPct} % ${ask.substrate?.label || "de desarrollo"} = ${fmt(quote.effM2)} m²` : " (sin extra de sustrato)"}
        {quote.kgPerM2 ? ` × ${fmt(quote.kgPerM2)} kg/m² = ${fmt(quote.totalKg)} kg` : ""}.
      </p>
      {quote.split && (
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Poliol</th><th>Isocianato</th>{systems && <><th>Sistemas</th><th>Kg cerrados</th><th>Sobra</th><th>Cubre hasta</th></>}</tr></thead>
          <tbody><tr>
            <td>{fmt(quote.split.poliol)} kg</td><td>{fmt(quote.split.iso)} kg</td>
            {systems && <><td><strong>{systems.count}</strong><br /><span className="muted small">manda el {systems.limiting}</span></td><td>{fmt(systems.closedKg)} kg</td><td>{fmt(systems.leftoverKg)} kg</td><td>{fmt(systems.coversM2)} m²</td></>}
          </tr></tbody>
        </table></div>
      )}
      <ul className="assistant-rivals">{quote.notes.map((line) => <li key={line}>{line}</li>)}</ul>
      <span className="muted small">Sin precios. Aclará siempre el sustrato: losa o madera no suman extra; la chapa sí.</span>
    </section>
  );
}
